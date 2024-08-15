/*****************************************************
 * University of California, Davis - Digital Agriculture Laboratory
 * Author: Mohammadreza Narimani
 * 
 * Description:
 * 
 * This script is designed to work within Google Earth Engine (GEE) to allow users to analyze and visualize various vegetation indices 
 * and thermal data for a user-defined region over a specified time period. The script provides an interactive map interface where users 
 * can draw a polygon to define an area of interest (AOI), select a date range, and choose a specific vegetation index or thermal band to 
 * display. The script supports indices such as Leaf Area Index (LAI), NDVI, and Canopy Chlorophyll, as well as Landsat 8 Thermal data.
 * 
 * Key functionalities include:
 * 1. Drawing Tool: Users can draw polygons on the map to define the AOI.
 * 2. Date Selection: Users can input a date to filter satellite imagery based on a 3-month window before and after the selected date.
 * 3. Layer Selection: Users can choose from a set of predefined vegetation indices and thermal data layers to display.
 * 4. Cloud Masking: Sentinel-2 images are cloud-masked to remove cloudy pixels from the analysis.
 * 5. Thermal Data Processing: The Landsat 8 thermal band is converted to brightness temperature in Celsius.
 * 6. Legend and Visualization: A dynamic legend is generated for each selected layer, displaying the range of values with appropriate color coding.
 * 
 * The script also incorporates a Gaussian Process Regression (GPR) model for retrieving crop traits from Sentinel-2 top-of-atmosphere data. 
 * This GPR model is based on the work by Estévez et al. (2022), which demonstrated the effective use of GPR for crop trait estimation in Google Earth Engine:
 * 
 * Estévez, J., Salinero-Delgado, M., Berger, K., Pipia, L., Rivera-Caicedo, J. P., Wocher, M., ... & Verrelst, J. (2022). Gaussian processes retrieval of crop traits in Google Earth Engine based on Sentinel-2 top-of-atmosphere data. Remote sensing of environment, 273, 112958.
 * 
 * The script is designed to be user-friendly, with clear instructions provided on the map interface. It is particularly useful for agricultural 
 * researchers and practitioners looking to analyze crop health and environmental conditions over time.
 *****************************************************/
 
 // Set the base map to Google Maps Hybrid (Satellite with labels)
Map.setOptions('HYBRID');

// Create a drawing tool to allow the user to draw a polygon on the map
var drawingTools = Map.drawingTools();
drawingTools.setShown(true);
drawingTools.setDrawModes(['polygon']);
drawingTools.setLinked(false);

// Function to clear the map layers
function clearMapLayers() {
  var layers = Map.layers();
  var numLayers = layers.length();
  for (var i = 0; i < numLayers; i++) {
    layers.remove(layers.get(0));  // Remove the first layer iteratively
  }
}

// Variable to hold the current legend panel
var currentLegendPanel;

// Function to clear the legend panel
function clearLegendPanel() {
  if (currentLegendPanel) {
    Map.remove(currentLegendPanel);
    currentLegendPanel = null;
  }
}

// Function to mask clouds and water in Sentinel-2 images
function maskS2cloud_and_water(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.addBands(image.updateMask(mask).divide(10000), null, true);
}

// Mapping of technical terms to user-friendly names
var layerNameMapping = {
  'LAI': 'Leaf Area Index',
  'laiCab': 'Canopy Chlorophyll',
  'laiCw': 'Canopy Water Content',
  'laiCm': 'Canopy Dry Matter',
  'Cab': 'Leaf Chlorophyll',
  'Cw': 'Leaf Water Content',
  'Cm': 'Leaf Dry Matter',
  'NDVI': 'NDVI',
  'LandsatThermal': 'Landsat 8 Thermal'
};

// Create a dropdown to select the crop_trait with renamed options and added layers
var cropTraitSelect = ui.Select({
  items: [
    {label: 'Leaf Area Index', value: 'LAI'},
    {label: 'Canopy Chlorophyll', value: 'laiCab'},
    {label: 'Canopy Water Content', value: 'laiCw'},
    {label: 'Canopy Dry Matter', value: 'laiCm'},
    {label: 'Leaf Chlorophyll', value: 'Cab'},
    {label: 'Leaf Water Content', value: 'Cw'},
    {label: 'Leaf Dry Matter', value: 'Cm'},
    {label: 'NDVI', value: 'NDVI'},
    {label: 'Landsat 8 Thermal', value: 'LandsatThermal'}
  ],
  placeholder: 'Select layer to display',
  value: 'laiCab'  // Default value (Canopy Chlorophyll)
});

// Create a label for date input range
var dateInputLabel = ui.Label({
  value: 'Supports from 2019 to Today',
  style: {fontWeight: 'bold', margin: '8px 0', textAlign: 'center'}
});

// Create a date picker using a textbox for date input
var dateInput = ui.Textbox({
  placeholder: 'Enter date (YYYY-MM-DD)',
  value: '2024-01-01',
  onChange: function(value) {
    // This function will be triggered when the user changes the date.
  },
  style: {stretch: 'horizontal', padding: '8px'}
});

// Instruction label above the Calculate button
var instructionLabel = ui.Label({
  value: 'Always Draw New Polygon, and Next Click on Calculate',
  style: {fontWeight: 'bold', textAlign: 'center', margin: '8px 0'}
});

// Create a "Calculate" button to trigger the analysis
var calculateButton = ui.Button({
  label: 'Calculate',
  onClick: function() {
    var selectedLayer = cropTraitSelect.getValue();
    runAnalysis(selectedLayer);
  },
  style: {stretch: 'horizontal', padding: '8px'}
});

// Create a panel to hold the dropdown, date picker, and button
var controlPanel = ui.Panel({
  widgets: [
    ui.Label('Select Layer:'),
    cropTraitSelect,
    dateInputLabel,
    ui.Label('Select Date:'),
    dateInput,
    instructionLabel,
    calculateButton
  ],
  style: {position: 'top-left', padding: '8px'}
});

// Add the control panel to the map
Map.add(controlPanel);

// Function to process crop traits using the GPR model
function crop_trait_gpr(image_orig, trait_model) {
  var XTrain_dim = trait_model.X_train.length().get([0]);
  var band_sequence = ee.List.sequence(1, XTrain_dim).map(function(element) {
    return ee.String('B').cat(ee.String(element)).replace('[.]+[0-9]*$', '');
  });
  var im_norm_ell2D_hypell = image_orig.subtract(ee.Image(trait_model.mx)).divide(ee.Image(trait_model.sx)).multiply(ee.Image(trait_model.hyp_ell)).toArray().toArray(1);
  var im_norm_ell2D = image_orig.subtract(ee.Image(trait_model.mx)).divide(ee.Image(trait_model.sx)).toArray().toArray(1);
  var PtTPt = im_norm_ell2D_hypell.matrixTranspose().matrixMultiply(im_norm_ell2D).arrayProject([0]).multiply(-0.5);
  var PtTDX = ee.Image(trait_model.X_train).matrixMultiply(im_norm_ell2D_hypell).arrayProject([0]).arrayFlatten([band_sequence]);
  var arg1 = PtTPt.exp().multiply(trait_model.hyp_sig);
  var k_star = PtTDX.subtract(ee.Image(trait_model.XDX_pre_calc).multiply(0.5)).exp().toArray();
  var mean_pred = k_star.arrayDotProduct(ee.Image(trait_model.alpha_coefficients).toArray()).multiply(arg1);
  mean_pred = mean_pred.toArray(1).arrayProject([0]).arrayFlatten([[trait_model.veg_index]]);
  mean_pred = mean_pred.add(trait_model.mean_model);
  image_orig = image_orig.addBands(mean_pred);
  return image_orig.select(trait_model.veg_index);
}

// When a geometry is drawn, run the analysis on that geometry
function runAnalysis(layer) {
  // Get the geometry from the drawing tool
  var aoi = drawingTools.layers().get(0).getEeObject();
  
  // Get the selected date from the date picker
  var selectedDateStr = dateInput.getValue();
  var selectedDate = ee.Date(selectedDateStr);

  // Clear the drawing tool and previous layers
  drawingTools.stop();  // Stop drawing mode
  drawingTools.clear();  // Clear any existing drawings
  clearMapLayers();  // Clear map layers
  clearLegendPanel();  // Clear the legend panel
  
  // Visualization parameters
  var visParams;
  var selectedLayer;

  // Add the Sentinel-2 RGB layer for all analyses
  var source_image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                        .filterBounds(aoi)
                        .filterDate(selectedDate.advance(-2, 'month'), selectedDate.advance(2, 'month')) // Changed to 2 months before and after
                        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
                        .map(maskS2cloud_and_water)
                        .select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'])
                        .mosaic()
                        .clip(aoi);

  var rgbVis = {
    min: 0.0,
    max: 0.3,
    bands: ['B4', 'B3', 'B2'],
  };
  Map.addLayer(source_image, rgbVis, 'Sentinel-2 RGB');

  if (layer === 'NDVI') {
    selectedLayer = source_image.normalizedDifference(['B8', 'B4']).rename('NDVI');

    visParams = {
      min: -1,
      max: 1,
      palette: ['#3E26A8','#3E27AC','#3F28AF','#3F29B2','#402AB4','#402BB7','#412CBA','#412DBD','#422EBF','#422FC2','#4330C5','#4331C8','#4332CA','#4433CD','#4434D0','#4535D2','#4537D5','#4538D7','#4639D9','#463ADC','#463BDE','#463DE0','#473EE1','#473FE3','#4741E5','#4742E6','#4744E8','#4745E9','#4746EB','#4848EC','#4849ED','#484BEE','#484CF0','#484EF1','#484FF2','#4850F3','#4852F4','#4853F5','#4854F6','#4756F7','#4757F7','#4759F8','#475AF9','#475BFA','#475DFA','#465EFB','#4660FB','#4661FC','#4562FC','#4564FD','#4465FD','#4367FD','#4368FE','#426AFE','#416BFE','#406DFE','#3F6EFF','#3E70FF','#3C71FF','#3B73FF','#3974FF','#3876FE','#3677FE','#3579FD','#337AFD','#327CFC','#317DFC','#307FFB','#2F80FA','#2F82FA','#2E83F9','#2E84F8','#2E86F8','#2E87F7','#2D88F6','#2D8AF5','#2D8BF4','#2D8CF3','#2D8EF2','#2C8FF1','#2C90F0','#2B91EF','#2A93EE','#2994ED','#2895EC','#2797EB','#2798EA','#2699E9','#269AE8','#259BE8','#259CE7','#249EE6','#249FE5','#23A0E5','#23A1E4','#22A2E4','#21A3E3','#20A5E3','#1FA6E2','#1EA7E1','#1DA8E1','#1DA9E0','#1CAADF','#1BABDE','#1AACDD','#19ADDC','#17AEDA','#16AFD9','#14B0D8','#12B1D6','#10B2D5','#0EB3D4','#0BB3D2','#08B4D1','#06B5CF','#04B6CE','#02B7CC','#01B7CA','#00B8C9','#00B9C7','#00BAC6','#01BAC4','#02BBC2','#04BBC1','#06BCBF','#09BDBD','#0DBDBC','#10BEBA','#14BEB8','#17BFB6','#1AC0B5','#1DC0B3','#20C1B1','#23C1AF','#25C2AE','#27C2AC','#29C3AA','#2BC3A8','#2CC4A6','#2EC4A5','#2FC5A3','#31C5A1','#32C69F','#33C79D','#35C79B','#36C899','#38C896','#39C994','#3BC992','#3DCA90','#40CA8D','#42CA8B','#45CB89','#48CB86','#4BCB84','#4ECC81','#51CC7F','#54CC7C','#57CC7A','#5ACC77','#5ECD74','#61CD72','#64CD6F','#67CD6C','#6BCD69','#6ECD66','#72CD64','#76CC61','#79CC5E','#7DCC5B','#81CC59','#84CC56','#88CB53','#8BCB51','#8FCB4E','#93CA4B','#96CA48','#9AC946','#9DC943','#A1C840','#A4C83E','#A7C73B','#ABC739','#AEC637','#B2C635','#B5C533','#B8C431','#BBC42F','#BEC32D','#C2C32C','#C5C22A','#C8C129','#CBC128','#CEC027','#D0BF27','#D3BF27','#D6BE27','#D9BE28','#DBBD28','#DEBC29','#E1BC2A','#E3BC2B','#E6BB2D','#E8BB2E','#EABA30','#ECBA32','#EFBA35','#F1BA37','#F3BA39','#F5BA3B','#F7BA3D','#F9BA3E','#FBBB3E','#FCBC3E','#FEBD3D','#FEBE3C','#FEC03B','#FEC13A','#FEC239','#FEC438','#FEC537','#FEC735','#FEC834','#FECA33','#FDCB32','#FDCD31','#FDCE31','#FCD030','#FBD22F','#FBD32E','#FAD52E','#F9D62D','#F9D82C','#F8D92B','#F7DB2A','#F7DD2A','#F6DE29','#F6E028','#F5E128','#F5E327','#F5E526','#F5E626','#F5E825','#F5E924','#F5EB23','#F5EC22','#F5EE21','#F6EF20','#F6F11F','#F6F21E','#F7F41C','#F7F51B','#F8F71A','#F8F818','#F9F916','#F9FB15']
    };

    // Add the selected layer and legend
    Map.addLayer(selectedLayer, visParams, 'NDVI');

  } else if (layer === 'LandsatThermal') {
    selectedLayer = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                          .filterBounds(aoi)
                          .filterDate(selectedDate.advance(-2, 'month'), selectedDate.advance(2, 'month')) // Changed to 2 months before and after
                          .filter(ee.Filter.lt('CLOUD_COVER_LAND', 10))
                          .sort('system:time_start', false)
                          .first()
                          .select('ST_B10')  // Select the thermal band B10
                          .clip(aoi);

    var thermalStats = selectedLayer.reduceRegion({
      reducer: ee.Reducer.minMax(),
      geometry: aoi,
      scale: 30,
      maxPixels: 1e13
    });
    
    thermalStats.evaluate(function(stats) {
      if (!stats) {
        print('No temperature data found for the selected region. Please choose a different region.');
        return;
      }
      
      var minDN = stats['ST_B10_min'];
      var maxDN = stats['ST_B10_max'];
      
      if (minDN === undefined || maxDN === undefined) {
        print('Error: Digital Number data is undefined.');
        return;
      }
      
      visParams = {
        min: minDN,
        max: maxDN,
        palette: ['#FFFFFF','#FCFCEF','#F9F9DF','#F5F5CE','#F2F2BE','#EFEFAE','#ECEC9E','#E8E88E','#E6E57E','#E6E071','#E6DB64','#E6D657','#E6D14A','#E6CD3D','#E6C830','#E6C323','#E6BD19','#E6B515','#E6AD12','#E6A50F','#E69D0C','#E69508','#E68D05','#E68502','#E77C02','#EA7407','#ED6C0C','#F06410','#F45C15','#F7541A','#FA4C1F','#FD4424','#F93F2C','#EC3D37','#DF3C43','#D23A4E','#C53859','#B83765','#AB3570','#9E347B','#933285','#89308D','#7F2F95','#762D9D','#6C2CA5','#622AAD','#5928B5','#4F27BD','#4926B9','#4426B1','#3F26A9','#3A26A1','#352699','#312691','#2C2689','#272681','#222271','#1D1D61','#181851','#131341','#0F0F31','#0A0A20','#050510','#000000']
      };
      Map.addLayer(selectedLayer, visParams, layerNameMapping[layer]);

      // Add the legend for Landsat Thermal
      addLegend(layer, visParams);
    });
    return;
  } else {
    // Load the crop trait model and visualization parameters
    var models = require('users/mnarimani/SatellitePlantTraitsVisualizer:TraitsGPRModels');
    var visParams = require('users/mnarimani/SatellitePlantTraitsVisualizer:LegendVisualization');
    var currentModel = models.models[layer];  // Define the current model here
    visParams = visParams.visparams[layer];
    
    selectedLayer = crop_trait_gpr(source_image, currentModel);
    selectedLayer = selectedLayer.where(selectedLayer.lt(0), ee.Image(0.00001));
  }

  // Add the selected layer and its legend for non-NDVI and non-LandsatThermal layers
  if (layer !== 'NDVI' && layer !== 'LandsatThermal') {
    Map.addLayer(selectedLayer, visParams, layerNameMapping[layer]);
  }
  
  addLegend(layer, visParams);
}

// Function to create and add a legend to the map
function addLegend(layer, visParams) {
  // Create the color bar for the legend.
  function makeColorBarParams(palette) {
    return {
      bbox: [0, 0, 1, 0.1],
      dimensions: '400x20',
      format: 'png',
      min: 0,
      max: 1,
      palette: palette,
    };
  }
  
  var colorBar = ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0),
    params: makeColorBarParams(visParams.palette),
    style: {stretch: 'horizontal', margin: '4px 8px', maxHeight: '24px'},
  });
  
  var widgetList = [];
  var step = (visParams.max - visParams.min) / 10;
  for (var i = 0; i <= 10; i++) {
    var value = visParams.min + (i * step);
    var labelText = value.toFixed(value < 1 ? 3 : value < 10 ? 2 : value < 100 ? 1 : 0);  // Adjust the decimal places based on value range
    var l = ui.Label(labelText, {margin: '2px 10px', textAlign: 'center', stretch: 'horizontal'}); // Increased horizontal margin
    widgetList.push(l);
  }
  
  // Customize legend titles
  var legendTitleText;
  switch(layer) {
    case 'LAI':
      legendTitleText = 'Leaf Area Index (m²/m²)';
      break;
    case 'laiCab':
      legendTitleText = 'Canopy Chlorophyll (g/m²)';
      break;
    case 'laiCw':
      legendTitleText = 'Canopy Water Content (g/m²)';
      break;
    case 'laiCm':
      legendTitleText = 'Canopy Dry Matter (g/m²)';
      break;
    case 'Cab':
      legendTitleText = 'Leaf Chlorophyll (ug/cm²)';
      break;
    case 'Cw':
      legendTitleText = 'Leaf Water Content (cm)';
      break;
    case 'Cm':
      legendTitleText = 'Leaf Dry Matter (g/cm²)';
      break;
    case 'NDVI':
      legendTitleText = 'Normalized Difference Vegetation Index (NDVI)';
      break;
    case 'LandsatThermal':
      legendTitleText = 'Landsat 8 Thermal Band (Digital Number)';
      break;
  }

  // Create the legend title
  var legendTitle = ui.Label({
    value: legendTitleText,
    style: {
      fontSize: '15px', 
      fontWeight: 'bold', 
      textAlign: 'center',
      fontFamily : 'Lucida Sans Unicode',
      stretch: 'both'
    }
  });

  // Create the legend panel and add to the map
  currentLegendPanel = ui.Panel({
    widgets: [legendTitle, colorBar, ui.Panel(widgetList, ui.Panel.Layout.flow('horizontal'))],
    style: {position: 'bottom-right'}
  });

  Map.add(currentLegendPanel);
}

// Listen for the polygon to be drawn
drawingTools.onDraw(function() {
  drawingTools.setDrawModes(['polygon']);  // Set the drawing mode again for a new polygon
  drawingTools.setShown(true);  // Show the drawing tools again
});

// Clear the map and reset drawing tools when clicking on the map
Map.onClick(function() {
  drawingTools.setDrawModes(['polygon']);
  drawingTools.setShown(true);
});

