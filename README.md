# GEE Satellite Plant Traits Visualizer

**University of California, Davis - Digital Agriculture Laboratory**  
**Author:** Mohammadreza Narimani, Alireza Pourreza

## Description

This script is designed to work within Google Earth Engine (GEE) to allow users to analyze and visualize various vegetation indices and thermal data for a user-defined region over a specified time period. The script provides an interactive map interface where users can draw a polygon to define an area of interest (AOI), select a date range, and choose a specific vegetation index or thermal band to display. The script supports indices such as Leaf Area Index (LAI), NDVI, and Canopy Chlorophyll, as well as Landsat 8 Thermal data.

### Key Functionalities Include:
1. **Drawing Tool:** Users can draw polygons on the map to define the AOI.
2. **Date Selection:** Users can input a date to filter satellite imagery based on a 3-month window before and after the selected date.
3. **Layer Selection:** Users can choose from a set of predefined vegetation indices and thermal data layers to display.
4. **Cloud Masking:** Sentinel-2 images are cloud-masked to remove cloudy pixels from the analysis.
5. **Thermal Data Processing:** The Landsat 8 thermal band is converted to brightness temperature in Celsius.
6. **Legend and Visualization:** A dynamic legend is generated for each selected layer, displaying the range of values with appropriate color coding.

The script also incorporates a Gaussian Process Regression (GPR) model for retrieving crop traits from Sentinel-2 top-of-atmosphere data. This GPR model is based on the work by Estévez et al. (2022), which demonstrated the effective use of GPR for crop trait estimation in Google Earth Engine:

> Estévez, J., Salinero-Delgado, M., Berger, K., Pipia, L., Rivera-Caicedo, J. P., Wocher, M., ... & Verrelst, J. (2022). Gaussian processes retrieval of crop traits in Google Earth Engine based on Sentinel-2 top-of-atmosphere data. Remote sensing of environment, 273, 112958.

### How to Use
To use this tool, you need to add the following three JavaScript files to your Google Earth Engine code editor and run them:

- `PolygonScaleTraits.js`
- `TraitsGPRModels.js`
- `legendVisualization.js`

If you have a Google Earth Engine account, you can directly click on [this link](https://code.earthengine.google.com/?accept_repo=users/mnarimani/SatellitePlantTraitsVisualizer) to add the code to the "Reader" section of your script panel.

### Explore the App
We have also developed the first version of our app! Click on [this link](https://ee-mnarimani.projects.earthengine.app/view/digitalaglabsatelliteplanttraitsvisualizer) to explore it.

## Contact

For further information or questions, please contact the author, Mohammadreza Narimani, at [mnarimani@ucdavis.edu].
