const express = require('express');
const Database = require('../models/Database');
const { auth } = require('../middleware/auth');
const mongoose = require('mongoose');

const router = express.Router();

// @route   POST /api/databases/:id/tables/:tableId/query
// @desc    Execute query on user's database table
// @access  Private
router.post('/:id/tables/:tableId/query', auth, async (req, res) => {
  try {
    const { filters = [], action = 'value', column } = req.body;

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

    // Build MongoDB query from filters
    const mongoQuery = buildMongoQuery(filters, table.columns);
    
    // Execute query on user's database
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
      
      let result;
      
      switch (action) {
        case 'count':
          result = { count: await collection.countDocuments(mongoQuery) };
          break;
          
        case 'value':
          if (!column) {
            return res.status(400).json({
              success: false,
              message: 'Column must be specified for value action'
            });
          }
          const singleDoc = await collection.findOne(mongoQuery, { 
            projection: { [column]: 1 } 
          });
          result = singleDoc ? { [column]: singleDoc[column] } : {};
          break;
          
        case 'values':
          if (!column) {
            return res.status(400).json({
              success: false,
              message: 'Column must be specified for values action'
            });
          }
          const docs = await collection.find(mongoQuery, { 
            projection: { [column]: 1 } 
          }).toArray();
          result = docs.map(doc => ({ [column]: doc[column] }));
          break;
          
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid action. Must be count, value, or values'
          });
      }
      
      res.json({
        success: true,
        data: result,
        query: mongoQuery, // For debugging
        recordCount: Array.isArray(result) ? result.length : 1
      });
      
    } finally {
      await userConnection.close();
    }

  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing database query',
      error: error.message
    });
  }
});

// Helper function to build MongoDB query from filters
function buildMongoQuery(filters, tableColumns) {
  if (!filters || filters.length === 0) {
    return {};
  }

  const conditions = [];
  
  filters.forEach((filter, index) => {
    if (!filter.column || !filter.operator || filter.value === undefined) {
      return; // Skip invalid filters
    }

    // Find column definition to get type
    const columnDef = tableColumns.find(col => col.name === filter.column);
    const columnType = columnDef ? columnDef.type : 'string';
    
    // Convert filter value to appropriate type
    const filterValue = convertFilterValue(filter.value, columnType);
    
    // Build MongoDB condition
    const condition = buildMongoCondition(filter.column, filter.operator, filterValue);
    
    if (condition) {
      conditions.push(condition);
    }
  });

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  // Handle multiple conditions with logic operators
  // For now, we'll use AND for all conditions
  // TODO: Implement proper logic operator handling (AND/OR)
  return { $and: conditions };
}

function convertFilterValue(value, type) {
  switch (type) {
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
      
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === '1' || value === 1;
      
    case 'date':
      return new Date(value);
      
    case 'string':
    default:
      return String(value);
  }
}

function buildMongoCondition(column, operator, value) {
  switch (operator) {
    case 'equals':
      return { [column]: value };
      
    case 'not_equals':
      return { [column]: { $ne: value } };
      
    case 'greater_than':
      return { [column]: { $gt: value } };
      
    case 'less_than':
      return { [column]: { $lt: value } };
      
    case 'greater_equal':
      return { [column]: { $gte: value } };
      
    case 'less_equal':
      return { [column]: { $lte: value } };
      
    case 'contains':
      return { [column]: { $regex: value, $options: 'i' } };
      
    default:
      console.warn(`Unknown operator: ${operator}`);
      return null;
  }
}

module.exports = router;