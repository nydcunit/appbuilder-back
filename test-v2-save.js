const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/appbuilder')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const App = require('./models/App');

// V2 data from Copy Canvas with calculations
const v2Data = {
  "_id": "683d765f024b63e929eb6bae",
  "name": "Format",
  "description": "This will allow format testing.",
  "appType": "web",
  "subdomain": "format",
  "screens": [
    {
      "id": 1,
      "name": "Home",
      "url": "",
      "elements": [
        {
          "id": "1748871771506",
          "type": "container",
          "contentType": "repeating",
          "repeatingConfig": {
            "databaseId": "6830e30ead2d775772d5f6ae",
            "tableId": "6830e31cad2d775772d5f6b6",
            "filters": []
          },
          "children": [
            {
              "id": "1748871783022",
              "type": "text",
              "properties": {
                "value": "id: {{CALC:calc_1748871796676_kmracaxvvyl}} value: {{CALC:calc_1748871804559_qutldmng5a}}"
              },
              "children": [],
              "calculations": {
                "calc_1748871796676_kmracaxvvyl": {
                  "id": "calc_1748871796676_kmracaxvvyl",
                  "steps": [
                    {
                      "id": "1748871783538",
                      "type": "value",
                      "config": {
                        "source": "repeating_container",
                        "value": "id (Table)",
                        "repeatingContainerId": "1748871771506",
                        "repeatingColumn": "id"
                      }
                    }
                  ],
                  "label": "Calculation",
                  "createdAt": "2025-06-02T13:43:16.676Z",
                  "updatedAt": "2025-06-02T13:43:16.676Z"
                },
                "calc_1748871804559_qutldmng5a": {
                  "id": "calc_1748871804559_qutldmng5a",
                  "steps": [
                    {
                      "id": "1748871783538",
                      "type": "value",
                      "config": {
                        "source": "repeating_container",
                        "value": "value (Table)",
                        "repeatingContainerId": "1748871771506",
                        "repeatingColumn": "value"
                      }
                    }
                  ],
                  "label": "Calculation",
                  "createdAt": "2025-06-02T13:43:24.559Z",
                  "updatedAt": "2025-06-02T13:43:24.559Z"
                }
              }
            }
          ]
        }
      ]
    }
  ],
  "settings": {
    "theme": "light",
    "layout": "fluid"
  },
  "globalState": {
    "activeTabs": {},
    "activeSliders": {},
    "customVariables": {}
  },
  "executionSettings": {
    "enableInMemoryExecution": true,
    "cacheDatabase": true,
    "debugMode": false
  }
};

async function testV2Save() {
  try {
    console.log('🧪 Testing V2 data save with calculations...');
    
    // Find the existing app
    const app = await App.findById("683d765f024b63e929eb6bae");
    if (!app) {
      console.log('❌ App not found');
      return;
    }
    
    console.log('📊 Before save - checking calculations...');
    const textElement = v2Data.screens[0].elements[0].children[0];
    console.log('✅ Text element has calculations:', Object.keys(textElement.calculations));
    
    // Update the app with V2 data
    app.screens = v2Data.screens;
    app.settings = v2Data.settings;
    app.globalState = v2Data.globalState;
    app.executionSettings = v2Data.executionSettings;
    
    await app.save();
    console.log('💾 App saved successfully');
    
    // Reload and check if calculations are preserved
    const reloadedApp = await App.findById("683d765f024b63e929eb6bae");
    const reloadedTextElement = reloadedApp.screens[0].elements[0].children[0];
    
    console.log('🔍 After reload - checking calculations...');
    if (reloadedTextElement.calculations && Object.keys(reloadedTextElement.calculations).length > 0) {
      console.log('✅ Calculations preserved:', Object.keys(reloadedTextElement.calculations));
      console.log('📊 Calculation data:', reloadedTextElement.calculations);
    } else {
      console.log('❌ Calculations LOST after save/reload');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

testV2Save();
