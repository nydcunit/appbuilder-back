const express = require('express');
const { body, validationResult } = require('express-validator');
const App = require('../models/App');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/apps
// @desc    Get all apps for authenticated user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    const query = { owner: req.user.id };
    
    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const apps = await App.find(query)
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip(skip)
      .select('name description createdAt updatedAt isPublished views'); // Don't send screens data for list view

    const total = await App.countDocuments(query);

    res.json({
      success: true,
      data: apps,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Fetch apps error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching apps'
    });
  }
});

// @route   GET /api/apps/:id
// @desc    Get single app by ID with full data
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const app = await App.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    res.json({
      success: true,
      data: app
    });

  } catch (error) {
    console.error('Fetch app error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error fetching app'
    });
  }
});

// @route   POST /api/apps
// @desc    Create new app
// @access  Private
router.post('/', [
  auth,
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('App name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot be more than 500 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description } = req.body;

    // Check if user already has an app with this name
    const existingApp = await App.findOne({
      name,
      owner: req.user.id
    });

    if (existingApp) {
      return res.status(400).json({
        success: false,
        message: 'You already have an app with this name'
      });
    }

    // Create app with default screen
    const app = await App.create({
      name,
      description: description || '',
      owner: req.user.id,
      screens: [{ id: 1, name: 'Home', elements: [] }]
    });

    res.status(201).json({
      success: true,
      message: 'App created successfully',
      data: app
    });

  } catch (error) {
    console.error('Create app error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating app'
    });
  }
});

// @route   PUT /api/apps/:id
// @desc    Update app (including screens and elements)
// @access  Private
router.put('/:id', [
  auth,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('App name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot be more than 500 characters'),
  body('screens')
    .optional()
    .isArray()
    .withMessage('Screens must be an array')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, screens, settings } = req.body;

    const app = await App.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    // Check for name conflict if name is being changed
    if (name && name !== app.name) {
      const existingApp = await App.findOne({
        name,
        owner: req.user.id,
        _id: { $ne: req.params.id }
      });

      if (existingApp) {
        return res.status(400).json({
          success: false,
          message: 'You already have an app with this name'
        });
      }
    }

    // Update fields
    if (name) app.name = name;
    if (description !== undefined) app.description = description;
    if (screens) app.screens = screens;
    if (settings) app.settings = { ...app.settings, ...settings };

    // Increment version on screen/element changes
    if (screens) {
      app.version += 1;
    }

    await app.save();

    res.json({
      success: true,
      message: 'App updated successfully',
      data: app
    });

  } catch (error) {
    console.error('Update app error:', error);
    
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error updating app'
    });
  }
});

// @route   DELETE /api/apps/:id
// @desc    Delete app
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const app = await App.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    await App.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'App deleted successfully'
    });

  } catch (error) {
    console.error('Delete app error:', error);
    
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error deleting app'
    });
  }
});

// @route   POST /api/apps/:id/publish
// @desc    Publish/unpublish app
// @access  Private
router.post('/:id/publish', auth, async (req, res) => {
  try {
    const { isPublished, isPublic } = req.body;

    const app = await App.findOne({
      _id: req.params.id,
      owner: req.user.id
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    app.isPublished = isPublished !== undefined ? isPublished : !app.isPublished;
    
    if (isPublic !== undefined) {
      app.isPublic = isPublic;
    }

    if (app.isPublished && !app.publishedAt) {
      app.publishedAt = new Date();
    }

    await app.save();

    res.json({
      success: true,
      message: `App ${app.isPublished ? 'published' : 'unpublished'} successfully`,
      data: {
        isPublished: app.isPublished,
        isPublic: app.isPublic,
        publishedAt: app.publishedAt,
        slug: app.slug
      }
    });

  } catch (error) {
    console.error('Publish app error:', error);
    
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error publishing app'
    });
  }
});

module.exports = router;