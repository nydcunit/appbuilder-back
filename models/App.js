const mongoose = require('mongoose');

// Schema for calculation steps
const calculationStepSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'operation'
  },
  operation: String,
  config: {
    source: String, // 'custom', 'element', 'database', 'repeating_container', 'passed_parameter', 'timestamp'
    value: String,
    elementId: String,
    containerValueType: String,
    databaseId: String,
    tableId: String,
    selectedColumn: String,
    action: String,
    filters: [{
      id: String,
      column: String,
      operator: String,
      value: String,
      logic: String
    }],
    repeatingContainerId: String,
    repeatingColumn: String,
    passedParameterName: String,
    passedParameterFromScreen: String
  }
}, { _id: false });

// Schema for calculations
const calculationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: String,
  description: String,
  steps: [calculationStepSchema]
}, { _id: false });

// Schema for condition steps (similar to calculation steps)
const conditionStepSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'operation'
  },
  operation: String, // 'equals', 'not_equals', 'greater_than', 'less_than', 'and', 'or', etc.
  config: {
    source: String,
    value: String,
    elementId: String,
    containerValueType: String,
    databaseId: String,
    tableId: String,
    selectedColumn: String,
    action: String,
    filters: [{
      id: String,
      column: String,
      operator: String,
      value: String,
      logic: String
    }],
    repeatingContainerId: String,
    repeatingColumn: String,
    passedParameterName: String,
    passedParameterFromScreen: String
  }
}, { _id: false });

// Schema for conditions
const conditionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: String,
  description: String,
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  steps: [conditionStepSchema]
}, { _id: false });

// Schema for individual elements (containers, text, etc.)
const elementSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['container', 'text', 'button', 'input', 'image', 'heading']
  },
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Add conditional rendering support
  renderType: {
    type: String,
    enum: ['fixed', 'conditional'],
    default: 'fixed'
  },
  conditions: [conditionSchema],
  // NEW: Store calculations that belong to this element
  calculations: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // ADD MISSING FIELDS FOR REPEATING CONTAINERS
  contentType: {
    type: String,
    enum: ['fixed', 'repeating', 'page'],
    default: 'fixed'
  },
  repeatingConfig: {
    databaseId: {
      type: String,
      default: null
    },
    tableId: {
      type: String,
      default: null
    },
    filters: [{
      id: String,
      column: String,
      operator: String,
      value: String,
      logic: String
    }]
  },
  // ADD CONTAINER TYPE AND SLIDER CONFIG FIELDS
  containerType: {
    type: String,
    enum: ['basic', 'slider', 'tabs'],
    default: 'basic'
  },
  sliderConfig: {
    autoPlay: {
      type: Boolean,
      default: false
    },
    loop: {
      type: Boolean,
      default: false
    },
    slidesToScroll: {
      type: Number,
      default: 1
    },
    activeTab: {
      type: String,
      default: '1'
    }
  },
  // ADD TABS CONFIG FIELDS
  tabsConfig: {
    activeTab: {
      type: String,
      default: '1'
    }
  },
  // ADD PAGE CONFIG FIELDS
  pageConfig: {
    selectedPageId: {
      type: String,
      default: null
    },
    parameters: [{
      id: String,
      name: String,
      value: String
    }]
  },
  children: [{
    type: mongoose.Schema.Types.Mixed, // Nested elements with full schema support
    default: []
  }]
}, { _id: false }); // Don't create separate _id for sub-documents

// Schema for screens within an app
const screenSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: [50, 'Screen name cannot be more than 50 characters']
  },
  url: {
    type: String,
    trim: true,
    default: ''
  },
  elements: [elementSchema]
}, { _id: false });

// Main app schema
const appSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'App name is required'],
    trim: true,
    maxlength: [100, 'App name cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters'],
    default: ''
  },
  appType: {
    type: String,
    enum: ['web', 'mobile'],
    default: 'web'
  },
  subdomain: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true, // Only unique if not null
    match: [/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens']
  },
  icon: {
    type: String, // Will store the file path or URL
    default: null
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  screens: {
    type: [screenSchema],
    default: [{ id: 1, name: 'Home', url: '', elements: [] }] // Default screen
  },
  homeScreenId: {
    type: Number,
    default: 1
  },
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    },
    layout: {
      type: String,
      enum: ['fixed', 'fluid'],
      default: 'fluid'
    }
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },
  slug: {
    type: String,
    unique: true,
    sparse: true // Only unique if not null
  },
  version: {
    type: Number,
    default: 1
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  // NEW: Store all calculations in app data
  calculations: {
    type: Map,
    of: calculationSchema,
    default: new Map()
  },
  // NEW: Store global app state (tabs, sliders, etc.)
  globalState: {
    activeTabs: {
      type: Map,
      of: Number,
      default: new Map()
    },
    activeSliders: {
      type: Map,
      of: Number,
      default: new Map()
    },
    customVariables: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map()
    }
  },
  // NEW: App execution settings
  executionSettings: {
    enableInMemoryExecution: {
      type: Boolean,
      default: true
    },
    cacheDatabase: {
      type: Boolean,
      default: true
    },
    debugMode: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Index for better query performance
appSchema.index({ owner: 1, createdAt: -1 });
appSchema.index({ slug: 1 });
appSchema.index({ subdomain: 1 });
appSchema.index({ isPublic: 1, isPublished: 1 });

// Generate slug before saving if published
appSchema.pre('save', function(next) {
  if (this.isPublished && !this.slug) {
    this.slug = this.name.toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now();
  }
  
  if (this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Instance method to increment views
appSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Static method to find public apps
appSchema.statics.findPublicApps = function(limit = 10, skip = 0) {
  return this.find({ isPublic: true, isPublished: true })
    .populate('owner', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model('App', appSchema);
