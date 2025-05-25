const express = require('express');
const { body, validationResult } = require('express-validator');
const Database = require('../models/Database');
const { auth } = require('../middleware/auth');
const mongoose = require('mongoose');

const router = express.Router();

// @route   GET /api/databases
// @desc    Get all databases for authenticated user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const databases = await Database.find({ 
      owner: req.user.id,
      status: 'active'
    })
      .select('name createdAt updatedAt mongoDbName')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: databases
    });

  } catch (error) {
    console.error('Fetch databases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching databases'
    });
  }
});

// @route   GET /api/databases/:id
// @desc    Get single database by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    res.json({
      success: true,
      data: database
    });

  } catch (error) {
    console.error('Fetch database error:', error);
    
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error fetching database'
    });
  }
});

// @route   POST /api/databases
// @desc    Create new database (creates actual MongoDB database)
// @access  Private
router.post('/', [
  auth,
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Database name must be between 1 and 100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name } = req.body;

    // Check if user already has a database with this name
    const existingDatabase = await Database.findOne({
      name,
      owner: req.user.id,
      status: 'active'
    });

    if (existingDatabase) {
      return res.status(400).json({
        success: false,
        message: 'You already have a database with this name'
      });
    }

    // Create actual MongoDB database
    const database = await Database.createUserDatabase(req.user.id, name);

    res.status(201).json({
      success: true,
      message: 'Database created successfully',
      data: database
    });

  } catch (error) {
    console.error('Create database error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating database'
    });
  }
});

// @route   DELETE /api/databases/:id
// @desc    Delete database (drops actual MongoDB database)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    await Database.deleteUserDatabase(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Database deleted successfully'
    });

  } catch (error) {
    console.error('Delete database error:', error);
    
    if (error.message === 'Database not found') {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error deleting database'
    });
  }
});

// @route   GET /api/databases/:id/tables
// @desc    Get all tables for a database
// @access  Private
router.get('/:id/tables', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    }).select('tables');

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    res.json({
      success: true,
      data: database.tables
    });

  } catch (error) {
    console.error('Fetch tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tables'
    });
  }
});

// @route   POST /api/databases/:id/tables
// @desc    Create new table in database (creates actual collection)
// @access  Private
router.post('/:id/tables', [
  auth,
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Table name must be between 1 and 100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name } = req.body;

    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    // Check if table name already exists
    const existingTable = database.tables.find(table => table.name === name);
    if (existingTable) {
      return res.status(400).json({
        success: false,
        message: 'Table with this name already exists'
      });
    }

    const newTable = await database.addTable(name);

    res.status(201).json({
      success: true,
      message: 'Table created successfully',
      data: newTable
    });

  } catch (error) {
    console.error('Create table error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating table'
    });
  }
});

// @route   DELETE /api/databases/:id/tables/:tableId
// @desc    Delete table from database (drops actual collection)
// @access  Private
router.delete('/:id/tables/:tableId', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    await database.removeTable(req.params.tableId);

    res.json({
      success: true,
      message: 'Table deleted successfully'
    });

  } catch (error) {
    console.error('Delete table error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting table'
    });
  }
});

// @route   GET /api/databases/:id/tables/:tableId/columns
// @desc    Get all columns for a table
// @access  Private
router.get('/:id/tables/:tableId/columns', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    res.json({
      success: true,
      data: table.columns.sort((a, b) => a.order - b.order)
    });

  } catch (error) {
    console.error('Fetch columns error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching columns'
    });
  }
});

// @route   POST /api/databases/:id/tables/:tableId/columns
// @desc    Create new column in table
// @access  Private
router.post('/:id/tables/:tableId/columns', [
  auth,
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Column name must be between 1 and 50 characters'),
  body('type')
    .isIn(['string', 'number', 'boolean', 'date'])
    .withMessage('Column type must be string, number, boolean, or date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, type } = req.body;

    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    // Check if column name already exists
    const existingColumn = table.columns.find(column => column.name === name);
    if (existingColumn) {
      return res.status(400).json({
        success: false,
        message: 'Column with this name already exists'
      });
    }

    const newColumn = await database.addColumn(req.params.tableId, { name, type });

    res.status(201).json({
      success: true,
      message: 'Column created successfully',
      data: newColumn
    });

  } catch (error) {
    console.error('Create column error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating column'
    });
  }
});

// @route   DELETE /api/databases/:id/tables/:tableId/columns/:columnId
// @desc    Delete column from table
// @access  Private
router.delete('/:id/tables/:tableId/columns/:columnId', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    const column = table.columns.id(req.params.columnId);
    if (!column) {
      return res.status(404).json({
        success: false,
        message: 'Column not found'
      });
    }

    await database.removeColumn(req.params.tableId, req.params.columnId);

    res.json({
      success: true,
      message: 'Column deleted successfully'
    });

  } catch (error) {
    console.error('Delete column error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting column'
    });
  }
});

// @route   GET /api/databases/:id/tables/:tableId/records
// @desc    Get all records for a table (from actual collection)
// @access  Private
router.get('/:id/tables/:tableId/records', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    // Get records from actual MongoDB collection
    const userConnection = database.getUserConnection();
    try {
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        userConnection.once('open', resolve);
        userConnection.once('error', reject);
        if (userConnection.readyState === 1) resolve();
      });
      
      const db = userConnection.db;
      const collection = db.collection(table.name);
      const records = await collection.find({}).toArray();
      
      res.json({
        success: true,
        data: records
      });
    } finally {
      await userConnection.close();
    }

  } catch (error) {
    console.error('Fetch records error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching records'
    });
  }
});

// @route   POST /api/databases/:id/tables/:tableId/records
// @desc    Create new record in table (insert into actual collection)
// @access  Private
router.post('/:id/tables/:tableId/records', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    // Validate and prepare record data
    const recordData = {};
    table.columns.forEach(column => {
      const value = req.body[column.name];
      if (value !== undefined) {
        recordData[column.name] = validateFieldValue(value, column.type);
      } else {
        recordData[column.name] = getDefaultValue(column.type);
      }
    });

    // Insert into actual MongoDB collection
    const userConnection = database.getUserConnection();
    try {
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        userConnection.once('open', resolve);
        userConnection.once('error', reject);
        if (userConnection.readyState === 1) resolve();
      });
      
      const db = userConnection.db;
      const collection = db.collection(table.name);
      const result = await collection.insertOne(recordData);
      
      // Get the inserted record
      const newRecord = await collection.findOne({ _id: result.insertedId });
      
      res.status(201).json({
        success: true,
        message: 'Record created successfully',
        data: newRecord
      });
    } finally {
      await userConnection.close();
    }

  } catch (error) {
    console.error('Create record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating record'
    });
  }
});

// @route   PUT /api/databases/:id/tables/:tableId/records/:recordId
// @desc    Update record in table (update in actual collection)
// @access  Private
router.put('/:id/tables/:tableId/records/:recordId', auth, async (req, res) => {
  try {
    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    // Validate update data
    const updateData = {};
    Object.keys(req.body).forEach(fieldName => {
      const column = table.columns.find(col => col.name === fieldName);
      if (column) {
        updateData[fieldName] = validateFieldValue(req.body[fieldName], column.type);
      }
    });

    // Update in actual MongoDB collection
    const userConnection = database.getUserConnection();
    try {
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        userConnection.once('open', resolve);
        userConnection.once('error', reject);
        if (userConnection.readyState === 1) resolve();
      });
      
      const db = userConnection.db;
      const collection = db.collection(table.name);
      const objectId = new mongoose.Types.ObjectId(req.params.recordId);
      
      const result = await collection.updateOne(
        { _id: objectId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Record not found'
        });
      }

      // Get updated record
      const updatedRecord = await collection.findOne({ _id: objectId });

      res.json({
        success: true,
        message: 'Record updated successfully',
        data: updatedRecord
      });
    } finally {
      await userConnection.close();
    }

  } catch (error) {
    console.error('Update record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating record'
    });
  }
});

// @route   POST /api/databases/:id/tables/:tableId/records/delete-multiple
// @desc    Delete multiple records from table (delete from actual collection)
// @access  Private
router.post('/:id/tables/:tableId/records/delete-multiple', [
  auth,
  body('recordIds')
    .isArray({ min: 1 })
    .withMessage('recordIds must be a non-empty array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { recordIds } = req.body;

    const database = await Database.findOne({
      _id: req.params.id,
      owner: req.user.id,
      status: 'active'
    });

    if (!database) {
      return res.status(404).json({
        success: false,
        message: 'Database not found'
      });
    }

    const table = database.tables.id(req.params.tableId);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    // Delete from actual MongoDB collection
    const userConnection = database.getUserConnection();
    try {
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        userConnection.once('open', resolve);
        userConnection.once('error', reject);
        if (userConnection.readyState === 1) resolve();
      });
      
      const db = userConnection.db;
      const collection = db.collection(table.name);
      const objectIds = recordIds.map(id => new mongoose.Types.ObjectId(id));
      
      const result = await collection.deleteMany({
        _id: { $in: objectIds }
      });

      res.json({
        success: true,
        message: `${result.deletedCount} record(s) deleted successfully`
      });
    } finally {
      await userConnection.close();
    }

  } catch (error) {
    console.error('Delete records error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting records'
    });
  }
});

// Helper functions for data validation
function validateFieldValue(value, type) {
  switch (type) {
    case 'number':
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    case 'boolean':
      return Boolean(value);
    case 'date':
      const date = new Date(value);
      return isNaN(date.getTime()) ? new Date() : date;
    case 'string':
    default:
      return String(value || '');
  }
}

function getDefaultValue(type) {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'date':
      return new Date();
    case 'string':
    default:
      return '';
  }
}

module.exports = router;