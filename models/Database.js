const mongoose = require('mongoose');

// Schema for column metadata
const columnSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['string', 'number', 'boolean', 'date'],
    default: 'string'
  },
  order: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true
});

// Schema for table metadata (no records stored here)
const tableSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  columns: [columnSchema]
}, { 
  timestamps: true
});

// Database metadata schema (actual data stored in separate MongoDB databases)
const databaseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Database name is required'],
    trim: true,
    maxlength: [100, 'Database name cannot be more than 100 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Store only table structure metadata, not actual data
  tables: [tableSchema],
  // MongoDB database name for the actual user data
  mongoDbName: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['active', 'deleted', 'error'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for better query performance
databaseSchema.index({ owner: 1, createdAt: -1 });
databaseSchema.index({ owner: 1, name: 1 }, { unique: true });
databaseSchema.index({ mongoDbName: 1 }, { unique: true });

// Generate MongoDB database name (max 38 bytes for MongoDB)
databaseSchema.methods.generateMongoDbName = function() {
  const sanitizedName = this.name.toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // Create shorter identifiers
  const userIdShort = this.owner.toString().slice(-8); // Last 8 chars of user ID
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  const nameShort = sanitizedName.slice(0, 15); // Max 15 chars from name
  
  // Format: udb_<8chars>_<15chars>_<6chars> = max 32 chars (well under 38 limit)
  return `udb_${userIdShort}_${nameShort}_${timestamp}`;
};

// Pre-save hook to generate MongoDB database name
databaseSchema.pre('save', function(next) {
  if (this.isNew && !this.mongoDbName) {
    this.mongoDbName = this.generateMongoDbName();
  }
  next();
});

// Instance method to get connection to the user's MongoDB database
databaseSchema.methods.getUserConnection = function() {
  const mongoose = require('mongoose');
  const baseUri = process.env.MONGODB_URI.split('/').slice(0, -1).join('/');
  const connectionString = `${baseUri}/${this.mongoDbName}`;
  
  return mongoose.createConnection(connectionString, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
};

// Instance method to add table (creates collection in user database)
databaseSchema.methods.addTable = async function(tableName) {
  // Add table metadata
  this.tables.push({
    name: tableName,
    columns: []
  });
  await this.save();
  
  // Create collection in user database
  const userConnection = this.getUserConnection();
  try {
    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      userConnection.once('open', resolve);
      userConnection.once('error', reject);
      if (userConnection.readyState === 1) resolve();
    });
    
    const db = userConnection.db;
    await db.createCollection(tableName);
    return this.tables[this.tables.length - 1];
  } catch (error) {
    // Remove from metadata if collection creation fails
    this.tables.pop();
    await this.save();
    throw error;
  } finally {
    await userConnection.close();
  }
};

// Instance method to remove table (drops collection from user database)
databaseSchema.methods.removeTable = async function(tableId) {
  const table = this.tables.id(tableId);
  if (!table) throw new Error('Table not found');
  
  const tableName = table.name;
  
  // Remove from metadata
  this.tables.id(tableId).remove();
  await this.save();
  
  // Drop collection from user database
  const userConnection = this.getUserConnection();
  try {
    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      userConnection.once('open', resolve);
      userConnection.once('error', reject);
      if (userConnection.readyState === 1) resolve();
    });
    
    const db = userConnection.db;
    await db.dropCollection(tableName);
  } catch (error) {
    // Collection might not exist, that's okay
    console.log(`Collection ${tableName} might not exist:`, error.message);
  } finally {
    await userConnection.close();
  }
};

// Instance method to add column to table
databaseSchema.methods.addColumn = async function(tableId, columnData) {
  const table = this.tables.id(tableId);
  if (!table) throw new Error('Table not found');
  
  // Set order for new column
  const maxOrder = table.columns.length > 0 
    ? Math.max(...table.columns.map(col => col.order)) 
    : -1;
  
  columnData.order = maxOrder + 1;
  table.columns.push(columnData);
  await this.save();
  
  return table.columns[table.columns.length - 1];
};

// Instance method to remove column from table
databaseSchema.methods.removeColumn = async function(tableId, columnId) {
  const table = this.tables.id(tableId);
  if (!table) throw new Error('Table not found');
  
  const column = table.columns.id(columnId);
  if (!column) throw new Error('Column not found');
  
  const columnName = column.name;
  
  // Remove column from metadata
  table.columns.id(columnId).remove();
  await this.save();
  
  // Remove field from all documents in the collection
  const userConnection = this.getUserConnection();
  try {
    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      userConnection.once('open', resolve);
      userConnection.once('error', reject);
      if (userConnection.readyState === 1) resolve();
    });
    
    const db = userConnection.db;
    const collection = db.collection(table.name);
    await collection.updateMany({}, { $unset: { [columnName]: "" } });
  } catch (error) {
    console.error('Error removing column from documents:', error);
  } finally {
    await userConnection.close();
  }
};

// Static method to create user database
databaseSchema.statics.createUserDatabase = async function(userId, databaseName) {
  try {
    // Create database metadata
    const database = new this({
      name: databaseName,
      owner: userId,
      tables: []
    });
    
    // Generate MongoDB database name
    database.mongoDbName = database.generateMongoDbName();
    
    // Save metadata first
    await database.save();
    
    // Test connection to user database (this creates it)
    const userConnection = database.getUserConnection();
    try {
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        userConnection.once('open', resolve);
        userConnection.once('error', reject);
        if (userConnection.readyState === 1) resolve();
      });
      
      // Create a test collection to ensure database is created
      const db = userConnection.db;
      await db.createCollection('_init');
      await db.dropCollection('_init');
    } finally {
      await userConnection.close();
    }
    
    return database;
  } catch (error) {
    console.error('Error creating user database:', error);
    throw error;
  }
};

// Static method to delete user database
databaseSchema.statics.deleteUserDatabase = async function(databaseId, userId) {
  try {
    const database = await this.findOne({ _id: databaseId, owner: userId });
    if (!database) throw new Error('Database not found');
    
    // Drop the entire user database
    const userConnection = database.getUserConnection();
    try {
      await userConnection.dropDatabase();
    } catch (error) {
      console.error('Error dropping user database:', error);
    } finally {
      await userConnection.close();
    }
    
    // Remove metadata
    await this.findByIdAndDelete(databaseId);
    
    return true;
  } catch (error) {
    console.error('Error deleting user database:', error);
    throw error;
  }
};

module.exports = mongoose.model('Database', databaseSchema);