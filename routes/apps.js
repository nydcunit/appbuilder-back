const express = require('express');
const { body, validationResult } = require('express-validator');
const App = require('../models/App');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/apps
// @desc    Get all apps for authenticated user or find by subdomain
// @access  Private (except for subdomain lookup)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', subdomain } = req.query;
    const skip = (page - 1) * limit;

    // If subdomain is provided, find app by subdomain (public access)
    if (subdomain) {
      const app = await App.findOne({ subdomain });
      if (!app) {
        return res.status(404).json({
          success: false,
          message: 'App not found'
        });
      }
      
      // Debug: Check if calculations are present in the app data
      console.log('🔍 Backend: Found app for subdomain:', subdomain);
      if (app.screens && app.screens.length > 0) {
        app.screens.forEach((screen, screenIndex) => {
          console.log(`🔍 Backend: Screen ${screenIndex} (${screen.name}) has ${screen.elements?.length || 0} elements`);
          if (screen.elements) {
            screen.elements.forEach((element, elementIndex) => {
              if (element.calculations && Object.keys(element.calculations).length > 0) {
                console.log(`✅ Backend: Element ${element.id} has calculations:`, Object.keys(element.calculations));
                console.log(`📊 Backend: Calculation data:`, element.calculations);
              }
            });
          }
        });
      }
      
      return res.json({
        success: true,
        data: [app] // Return as array for consistency
      });
    }

    // Otherwise, require authentication for user's apps
    if (!req.headers.authorization) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Apply auth middleware
    const authResult = await new Promise((resolve) => {
      const { auth } = require('../middleware/auth');
      auth(req, res, (err) => {
        resolve(err);
      });
    });

    if (authResult) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    }

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
      .select('name description appType subdomain createdAt updatedAt isPublished views'); // Don't send screens data for list view

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
    .withMessage('Description cannot be more than 500 characters'),
  body('appType')
    .optional()
    .isIn(['web', 'mobile'])
    .withMessage('App type must be either web or mobile'),
  body('subdomain')
    .optional()
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Subdomain can only contain lowercase letters, numbers, and hyphens')
    .isLength({ min: 3, max: 50 })
    .withMessage('Subdomain must be between 3 and 50 characters')
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

    const { name, description, appType, subdomain } = req.body;

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

    // Check subdomain uniqueness if provided
    if (subdomain) {
      const existingSubdomain = await App.findOne({ subdomain });
      if (existingSubdomain) {
        return res.status(400).json({
          success: false,
          message: 'This subdomain is already taken'
        });
      }
    }

    // Create app with default screen
    const appData = {
      name,
      description: description || '',
      owner: req.user.id,
      screens: [{ id: 1, name: 'Home', elements: [] }]
    };

    // Add optional fields if provided
    if (appType) appData.appType = appType;
    if (subdomain) appData.subdomain = subdomain;

    const app = await App.create(appData);

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
  body('appType')
    .optional()
    .isIn(['web', 'mobile'])
    .withMessage('App type must be either web or mobile'),
  body('subdomain')
    .optional()
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Subdomain can only contain lowercase letters, numbers, and hyphens')
    .isLength({ min: 3, max: 50 })
    .withMessage('Subdomain must be between 3 and 50 characters'),
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

    const { name, description, appType, subdomain, screens, settings, homeScreenId } = req.body;

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

    // Check subdomain uniqueness if being changed
    if (subdomain && subdomain !== app.subdomain) {
      const existingSubdomain = await App.findOne({
        subdomain,
        _id: { $ne: req.params.id }
      });

      if (existingSubdomain) {
        return res.status(400).json({
          success: false,
          message: 'This subdomain is already taken'
        });
      }
    }

    // Update fields
    if (name) app.name = name;
    if (description !== undefined) app.description = description;
    if (appType) app.appType = appType;
    if (subdomain !== undefined) app.subdomain = subdomain;
    if (screens) {
      // Debug: Check what calculations are being saved
      console.log('💾 Backend: Saving screens with calculations...');
      screens.forEach((screen, screenIndex) => {
        console.log(`💾 Backend: Screen ${screenIndex} (${screen.name}) has ${screen.elements?.length || 0} elements`);
        if (screen.elements) {
          screen.elements.forEach((element, elementIndex) => {
            if (element.calculations && Object.keys(element.calculations).length > 0) {
              console.log(`💾 Backend: Element ${element.id} being saved with calculations:`, Object.keys(element.calculations));
              console.log(`💾 Backend: Calculation data being saved:`, element.calculations);
            }
          });
        }
      });
      app.screens = screens;
    }
    if (settings) app.settings = { ...app.settings, ...settings };
    if (homeScreenId !== undefined) app.homeScreenId = homeScreenId;

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
