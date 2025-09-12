import { useMemo, useRef, useState, useEffect } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import addTreemapModule from "highcharts/modules/treemap";
import { client, useConfig, useElementData, useElementColumns, useVariable } from "@sigmacomputing/plugin";
//npm install highcharts highcharts-react-official
import * as d3 from "d3";

// Helper function to convert HSL to RGB
function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Helper function to convert RGB to hex
function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Helper function to generate heatmap colors
function generateHeatmapColors(values, baseColor = [0, 100, 50]) { // Default to red-ish color
  if (!values || values.length === 0) return {};
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  if (range === 0) {
    // All values are the same, return the base color
    const [h, s, l] = baseColor;
    const [r, g, b] = hslToRgb(h/360, s/100, l/100);
    return { [values[0]]: rgbToHex(r, g, b) };
  }
  
  const colorMap = {};
  values.forEach(value => {
    // Normalize value to 0-1 range
    const normalized = (value - min) / range;
    // Adjust lightness based on value (higher values = darker colors)
    // Use a wider range for better visual distinction: 30% to 90% lightness
    const lightness = Math.max(30, 90 - (normalized * 60)); 
    const [h, s] = baseColor;
    const [r, g, b] = hslToRgb(h/360, s/100, lightness/100);
    colorMap[value] = rgbToHex(r, g, b);
  });
  
  return colorMap;
}

// Highcharts default colors (in order)
const HIGHCHARTS_DEFAULT_COLORS = [
  '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9',
  '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1'
];

// Color palettes for different styles
const COLOR_PALETTES = {
  'Vivid': [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ],
  'Pastels': [
    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
    '#E6B3FF', '#FFB3E6', '#B3FFE6', '#FFE6B3', '#E6FFB3'
  ],
  'Muted': [
    '#8B7D6B', '#6B8B7D', '#7D6B8B', '#8B6B7D', '#6B7D8B',
    '#7D8B6B', '#8B6B6B', '#6B8B6B', '#6B6B8B', '#8B8B6B'
  ],
  'Bright': [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF',
    '#00FFFF', '#FF8000', '#8000FF', '#00FF80', '#FF0080'
  ],
  'Earth Tones': [
    '#8B4513', '#A0522D', '#CD853F', '#DEB887', '#F4A460',
    '#D2691E', '#BC8F8F', '#D2B48C', '#F5DEB3', '#FFE4B5'
  ],
  'Cool': [
    '#4169E1', '#00BFFF', '#1E90FF', '#87CEEB', '#B0E0E6',
    '#4682B4', '#5F9EA0', '#20B2AA', '#00CED1', '#48D1CC'
  ],
  'Warm': [
    '#FF6347', '#FF7F50', '#FFA500', '#FFD700', '#FFFF00',
    '#FF8C00', '#FF4500', '#DC143C', '#B22222', '#CD5C5C'
  ],
  'Monochrome': [
    '#2C2C2C', '#4A4A4A', '#696969', '#808080', '#A9A9A9',
    '#C0C0C0', '#D3D3D3', '#DCDCDC', '#E6E6E6', '#F5F5F5'
  ],
  'Highcharts Default': HIGHCHARTS_DEFAULT_COLORS
};

// Helper function to get a consistent color index for a name
function getColorIndex(name, colorPalette = 'Highcharts Default') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = COLOR_PALETTES[colorPalette] || HIGHCHARTS_DEFAULT_COLORS;
  return Math.abs(hash) % colors.length;
}

// Helper function to get color index based on order (like Highcharts colorByPoint)
function getColorIndexByOrder(items, targetItem, colorPalette = 'Highcharts Default') {
  const sortedItems = [...items].sort();
  const index = sortedItems.indexOf(targetItem);
  const colors = COLOR_PALETTES[colorPalette] || HIGHCHARTS_DEFAULT_COLORS;
  return index % colors.length;
}

// Helper function to convert hex to HSL
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  return [h * 360, s * 100, l * 100];
}

// Helper function to get region base colors using selected color palette
function getRegionBaseColor(regionName, allRegions = [], colorPalette = 'Highcharts Default', enableDebugLogging = false) {
  let colorIndex;
  if (allRegions.length > 0) {
    colorIndex = getColorIndexByOrder(allRegions, regionName, colorPalette);
  } else {
    colorIndex = getColorIndex(regionName, colorPalette);
  }
  const colors = COLOR_PALETTES[colorPalette] || HIGHCHARTS_DEFAULT_COLORS;
  const hexColor = colors[colorIndex];
  const hslColor = hexToHsl(hexColor);
  debugLog(enableDebugLogging, `🔍 getRegionBaseColor("${regionName}") -> index: ${colorIndex}, hex: ${hexColor}, hsl: [${hslColor.join(', ')}]`);
  return hslColor;
}

// Helper function to get state base colors using selected color palette
function getStateBaseColor(stateName, colorPalette = 'Highcharts Default', enableDebugLogging = false) {
  const colorIndex = getColorIndex(stateName, colorPalette);
  const colors = COLOR_PALETTES[colorPalette] || HIGHCHARTS_DEFAULT_COLORS;
  const hexColor = colors[colorIndex];
  const hslColor = hexToHsl(hexColor);
  debugLog(enableDebugLogging, `🔍 getStateBaseColor("${stateName}") -> index: ${colorIndex}, hex: ${hexColor}, hsl: [${hslColor.join(', ')}]`);
  return hslColor;
}

// Helper function to get the hex color that Highcharts would assign
function getHighchartsColor(name, colorPalette = 'Highcharts Default') {
  const colorIndex = getColorIndex(name, colorPalette);
  const colors = COLOR_PALETTES[colorPalette] || HIGHCHARTS_DEFAULT_COLORS;
  return colors[colorIndex];
}

// Helper function to format numbers with commas
function formatNumber(num) {
  if (num == null || isNaN(num)) return '';
  return num.toLocaleString();
}

// Helper function to format numbers using Sigma format mask
function formatNumberWithMask(value, columnInfo, columnId) {
  if (value == null || isNaN(value)) return '';
  
  // Check if column is numeric and has a format specified
  if (columnInfo && columnInfo[columnId] && 
      columnInfo[columnId].columnType === 'number' && 
      typeof value === 'number' && 
      columnInfo[columnId].format?.format) {
    try {
      return d3.format(columnInfo[columnId].format.format)(value);
    } catch (e) {
      console.warn(`Failed to apply format ${columnInfo[columnId].format.format} to value ${value}`);
      return formatNumber(value); // Fallback to default formatting
    }
  }
  
  return formatNumber(value); // Default formatting
}

// Helper function to calculate relative luminance of a color
function getLuminance(hex) {
  const rgb = parseInt(hex.slice(1), 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Helper function to get contrasting text color (black or white)
function getContrastColor(backgroundColor) {
  const luminance = getLuminance(backgroundColor);
  // If luminance is high (light background), use dark text; if low (dark background), use light text
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

// Helper function for conditional debug logging
function debugLog(enableDebugLogging, ...args) {
  if (enableDebugLogging) {
    console.log(...args);
  }
}



client.config.configureEditorPanel([
  { name: "source", type: "element" },
  { name: "dimension", type: "column", source: "source", allowMultiple: true },
  { name: "measures", type: "column", source: "source", allowMultiple: true },
  { name: "enableHeatmap", type: "checkbox", defaultValue: true },
  { name: "showValues", type: "checkbox", defaultValue: false },
  { name: "enableDebugLogging", type: "checkbox", defaultValue: false },
  {
    name: "labelFontSize",
    type: "dropdown",
    values: ["8px", "10px", "12px", "14px", "16px", "18px", "20px", "22px", "24px"],
    defaultValue: "14px"
  },
  {
    name: "valueFontSize",
    type: "dropdown",
    values: ["6px", "8px", "9px", "10px", "11px", "12px", "14px", "16px", "18px", "20px"],
    defaultValue: "11px"
  },
  {
    name: "colorPalette",
    type: "dropdown",
    values: ["Vivid", "Pastels", "Muted", "Bright", "Earth Tones", "Cool", "Warm", "Monochrome", "Highcharts Default"],
    defaultValue: "Highcharts Default"
  },
  {
    name: "labelStyle",
    type: "dropdown",
    values: ["value", "percent"],
    defaultValue: "value"
  },
  { name: "tileClickControl", type: "variable" },
]);

addTreemapModule(Highcharts);

function App() {
  const config = useConfig();
  const sigmaData = useElementData(config.source);
  const columnInfo = useElementColumns(config.source);
  const ref = useRef();
  const enableHeatmap = client.config.getKey("enableHeatmap");
  const showValues = client.config.getKey("showValues");
  const enableDebugLogging = client.config.getKey("enableDebugLogging");
  debugLog(enableDebugLogging, '🚀 App component rendering');
  const labelFontSize = client.config.getKey("labelFontSize");
  const valueFontSize = client.config.getKey("valueFontSize");
  const colorPalette = client.config.getKey("colorPalette");
  const labelStyle = client.config.getKey("labelStyle");
  const [, setTileClickControlVar] = useVariable(config.tileClickControl); // Only setter, do not read value
  
  // Handle tile click to set control variable
  const handleTileClick = (tileName) => {
    debugLog(enableDebugLogging, '🖱️ Tile clicked:', tileName);
    if (config.tileClickControl) {
      debugLog(enableDebugLogging, '🖱️ Setting control variable to:', tileName);
      setTileClickControlVar(tileName);
      debugLog(enableDebugLogging, 'Tile clicked, setting control variable:', tileName);
    }
  };
  
  // Use localStorage to persist drill state across any component re-mounting
  const getInitialDrillState = () => {
    try {
      const saved = localStorage.getItem('treemap-drill-state');
      if (saved) {
        const parsed = JSON.parse(saved);
        debugLog(enableDebugLogging, '🔄 Restored drill state from localStorage:', parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to restore drill state from localStorage:', e);
    }
    return {
      currentLevel: 0,
      drillPath: []
    };
  };
  
  const [drillState, setDrillState] = useState(getInitialDrillState);
  
  // Wrapper function to update drill state and persist to localStorage
  const setDrillStateWithLogging = (newState) => {
    debugLog(enableDebugLogging, '🔧 setDrillState called with:', newState, 'from:', new Error().stack);
    setDrillState(newState);
    try {
      localStorage.setItem('treemap-drill-state', JSON.stringify(newState));
      debugLog(enableDebugLogging, '💾 Saved drill state to localStorage:', newState);
    } catch (e) {
      console.warn('Failed to save drill state to localStorage:', e);
    }
  };
  
  debugLog(enableDebugLogging, '📱 Current drillState:', drillState);
  
  // Check if tile click control is configured
  const hasTileClickControl = !!config.tileClickControl;
  
  // Track when enableHeatmap changes
  useEffect(() => {
    debugLog(enableDebugLogging, '⚡ enableHeatmap changed to:', enableHeatmap, 'drillState at time of change:', drillState);
  }, [enableHeatmap]);
  
  // Optional: Clear localStorage on component unmount (uncomment if needed)
  // useEffect(() => {
  //   return () => {
  //     localStorage.removeItem('treemap-drill-state');
  //   };
  // }, []);
  
  const options = useMemo(() => {
    debugLog(enableDebugLogging, '🔄 useMemo recalculating - enableHeatmap:', enableHeatmap, 'drillState:', drillState);
    debugLog(enableDebugLogging, '🔍 SIMPLE TEST: This should appear in console');
    const dimensions = config.dimension;
    const measures = config.measures;
    if (!(dimensions && measures)) return false;

    if (!sigmaData?.[dimensions[0]]) {
      return null;
    }

    // transform sigmaData --> treemap data
    let dataMap = {};
    const delim = "__";
    
    // Helper function to get parent ID
    function getParent(i, j) {
      if (i > 0) {
        return getId(i - 1, j);
      } else {
        return undefined;
      }
    }
    
    // Helper function to generate ID
    function getId(i, j) {
      const parent = getParent(i, j);
      let id = "";
      if (parent) {
        id = parent + delim;
      }
      id += dimensions[i] + delim + sigmaData[dimensions[i]][j];
      return id;
    }

    // Process all data first
    for (let i = 0; i < dimensions.length; i++) {
      for (let j = 0; j < sigmaData[dimensions[i]].length; j++) {
        const name = sigmaData[dimensions[i]][j];
        const value = sigmaData[measures[i]][j];
        const id = getId(i, j);
        const parent = getParent(i, j);
        const dataPoint = {
          id,
          name,
          value,
          level: i,
          ...(parent && { parent }),
        };
        dataMap[id] = dataPoint;
      }
    }

    // Filter data based on current drill state
    let filteredData = {}; // Clear filtered data
    const currentLevel = drillState.currentLevel;
    const drillPath = drillState.drillPath;
    
    debugLog(enableDebugLogging, '📊 Filtering data - Level:', currentLevel, 'Path:', drillPath);
    
    if (dimensions.length === 3) {
      if (currentLevel === 0) {
        // Initial view: show regions with states nested inside
        Object.values(dataMap).forEach(point => {
          if (point.level === 0) {
            // Add all regions
            filteredData[point.id] = point;
          } else if (point.level === 1) {
            // Add all states as children of their regions
            filteredData[point.id] = point;
          }
          // Don't show cities in initial view
        });
      } else if (currentLevel === 1) {
        // Drilled into a region: show states with cities nested inside
        const selectedRegion = drillPath[0];
        Object.values(dataMap).forEach(point => {
          if (point.level === 1 && point.id.includes(`__${selectedRegion}__`)) {
            // Add states within the selected region (use double underscores for exact match)
            filteredData[point.id] = point;
          } else if (point.level === 2 && point.id.includes(`__${selectedRegion}__`)) {
            // Add cities within the selected region (use double underscores for exact match)
            filteredData[point.id] = point;
          }
        });
      } else if (currentLevel === 2) {
        // Drilled into a state: show only cities within that state
        const selectedRegion = drillPath[0];
        const selectedState = drillPath[1];
        Object.values(dataMap).forEach(point => {
          if (point.level === 2 && 
              point.id.includes(`__${selectedRegion}__`) && 
              point.id.includes(`__${selectedState}__`)) {
            filteredData[point.id] = point;
          }
        });
      }
    } else if (dimensions.length === 2) {
      // For 2-level hierarchy, show first level with second level nested
      Object.values(dataMap).forEach(point => {
        filteredData[point.id] = point;
      });
    } else if (dimensions.length === 1) {
      // For single level, show all data
      Object.values(dataMap).forEach(point => {
        filteredData[point.id] = point;
      });
    }
    
    debugLog(enableDebugLogging, '✅ Final filtered data count:', Object.keys(filteredData).length);
    
    // Generate heatmap colors based on current drill state
    const shouldUseHeatmap = enableHeatmap && (dimensions.length === 1 || dimensions.length === 3);
    debugLog(enableDebugLogging, '🎨 Heatmap settings - enableHeatmap:', enableHeatmap, 'shouldUseHeatmap:', shouldUseHeatmap);
    let heatmapColors = {};
    
    // Log what colors would be used when heatmap is off (Highcharts colorByPoint)
    if (!shouldUseHeatmap) {
      debugLog(enableDebugLogging, '🔍 DEBUG: Heatmap OFF - Highcharts will assign colors via colorByPoint');
      debugLog(enableDebugLogging, '🔍 DEBUG: Highcharts default colors:', HIGHCHARTS_DEFAULT_COLORS);
    }
    
    if (shouldUseHeatmap) {
      if (dimensions.length === 1) {
        // Single level: use first color from selected palette as base
        const levelValues = Object.values(filteredData).map(point => point.value);
        const colors = COLOR_PALETTES[colorPalette] || HIGHCHARTS_DEFAULT_COLORS;
        const baseColorHex = colors[0]; // Use first color from palette
        const baseColorHsl = hexToHsl(baseColorHex);
        debugLog(enableDebugLogging, `🔍 DEBUG: Single level heatmap - using base color: ${baseColorHex} -> HSL: [${baseColorHsl.join(', ')}]`);
        heatmapColors = generateHeatmapColors(levelValues, baseColorHsl);
      } else if (dimensions.length === 3) {
        const currentLevel = drillState.currentLevel;
        
        if (currentLevel === 0) {
          // Initial view: color by region for regions and states
          const regionGroups = {};
          
          // Group data by region
          Object.values(filteredData).forEach(point => {
            const idParts = point.id.split(delim);
            if (idParts.length >= 2) {
              const region = idParts[1]; // Region is the second part of the ID
              if (!regionGroups[region]) {
                regionGroups[region] = [];
              }
              regionGroups[region].push(point.value);
            }
          });
          
          // Generate heatmap colors for each region
          const allRegions = Object.keys(regionGroups);
          Object.keys(regionGroups).forEach(region => {
            const regionBaseColor = getRegionBaseColor(region, allRegions, colorPalette, enableDebugLogging);
            const regionHeatmapColors = generateHeatmapColors(regionGroups[region], regionBaseColor);
            
            debugLog(enableDebugLogging, `🔍 DEBUG: Region "${region}" base color:`, regionBaseColor);
            debugLog(enableDebugLogging, `🔍 DEBUG: Region "${region}" heatmap colors:`, regionHeatmapColors);
            
            // Add region prefix to avoid conflicts
            Object.keys(regionHeatmapColors).forEach(value => {
              heatmapColors[`${region}__${value}`] = regionHeatmapColors[value];
            });
          });
        } else if (currentLevel === 1) {
          // Region view: color by state for states and cities
          const stateGroups = {};
          
          // Group data by state
          Object.values(filteredData).forEach(point => {
            const idParts = point.id.split(delim);
            if (idParts.length >= 4) {
              const state = idParts[3]; // State is the fourth part of the ID
              if (!stateGroups[state]) {
                stateGroups[state] = [];
              }
              stateGroups[state].push(point.value);
            }
          });
          
          // Generate heatmap colors for each state
          Object.keys(stateGroups).forEach(state => {
            const stateBaseColor = getStateBaseColor(state, colorPalette, enableDebugLogging);
            const stateHeatmapColors = generateHeatmapColors(stateGroups[state], stateBaseColor);
            
            // Add state prefix to avoid conflicts
            Object.keys(stateHeatmapColors).forEach(value => {
              heatmapColors[`${state}__${value}`] = stateHeatmapColors[value];
            });
          });
        } else if (currentLevel === 2) {
          // State view: color by state for cities
          const selectedState = drillState.drillPath[1];
          const stateBaseColor = getStateBaseColor(selectedState, colorPalette, enableDebugLogging);
          const levelValues = Object.values(filteredData).map(point => point.value);
          heatmapColors = generateHeatmapColors(levelValues, stateBaseColor);
        }
      }
    }
    
    // Calculate percentages for each level if labelStyle is 'percent'
    if (labelStyle === 'percent') {
      // Group data by level to calculate percentages within each level
      const levelGroups = {};
      Object.values(filteredData).forEach(point => {
        if (!levelGroups[point.level]) {
          levelGroups[point.level] = [];
        }
        levelGroups[point.level].push(point);
      });
      
      // Calculate total for each level and assign percentages
      Object.keys(levelGroups).forEach(level => {
        const levelData = levelGroups[level];
        const total = levelData.reduce((sum, point) => sum + (point.value || 0), 0);
        
        levelData.forEach(point => {
          point.percentage = total > 0 ? (point.value / total) * 100 : 0;
        });
      });
    }

    // Convert filtered data to array and apply colors
    let data = [];
    let i = 0;
    for (var key in filteredData) {
      const dataPoint = { ...filteredData[key] }; // Create a copy to avoid mutating original
      
      // Apply heatmap color if we should use heatmap
      if (shouldUseHeatmap && dataPoint.value !== undefined) {
        if (dimensions.length === 1) {
          // Single level: use value directly
          dataPoint.color = heatmapColors[dataPoint.value];
          debugLog(enableDebugLogging, `🔍 DEBUG: Single level - ${dataPoint.name}: ${dataPoint.color}`);
        } else if (dimensions.length === 3) {
          const currentLevel = drillState.currentLevel;
          
            if (currentLevel === 0) {
              // Initial view: use region + value combination
              const idParts = dataPoint.id.split(delim);
              if (idParts.length >= 2) {
                const region = idParts[1]; // Region is the second part of the ID
                const colorKey = `${region}__${dataPoint.value}`;
                dataPoint.color = heatmapColors[colorKey];
                debugLog(enableDebugLogging, `🔍 DEBUG: Level 0 - ${dataPoint.name} (value: ${dataPoint.value}, colorKey: ${colorKey}) -> ${dataPoint.color}`);
              }
          } else if (currentLevel === 1) {
            // Region view: use state + value combination
            const idParts = dataPoint.id.split(delim);
            if (idParts.length >= 4) {
              const state = idParts[3]; // State is the fourth part of the ID
              const colorKey = `${state}__${dataPoint.value}`;
              dataPoint.color = heatmapColors[colorKey];
              debugLog(enableDebugLogging, `🔍 DEBUG: Level 1 - ${dataPoint.name} (value: ${dataPoint.value}, colorKey: ${colorKey}) -> ${dataPoint.color}`);
            }
          } else {
            // State view: use value directly
            dataPoint.color = heatmapColors[dataPoint.value];
            debugLog(enableDebugLogging, `🔍 DEBUG: Level 2 - ${dataPoint.name} (value: ${dataPoint.value}) -> ${dataPoint.color}`);
          }
        }
      }
      
      data[i] = dataPoint;
      i++;
    }

    const options = {
      title: {
        text: undefined,
      },
      chart: {
        height: window.innerHeight,
        backgroundColor: "transparent",
      },
      colors: COLOR_PALETTES[colorPalette] || HIGHCHARTS_DEFAULT_COLORS,
      plotOptions: {
        series: {
            animation: false
        }
      },
      tooltip: {
        formatter: function() {
          const measureColumnId = measures[this.point.level] || measures[0];
          const formattedValue = formatNumberWithMask(this.point.value, columnInfo, measureColumnId);
          
          if (labelStyle === 'percent' && this.point.percentage !== undefined) {
            return `<b>${this.point.name}</b><br/>Value: ${formattedValue}<br/>Percentage: ${this.point.percentage.toFixed(1)}%`;
          } else {
            return `<b>${this.point.name}</b><br/>Value: ${formattedValue}`;
          }
        }
      },
      series: [
        {
          levels: [
            {
              level: 1,
              colorByPoint: !shouldUseHeatmap, // Only use colorByPoint when not using heatmap
              borderWidth: 6,
              levelIsConstant: false,
              dataLabels: {
                enabled: true,
                align: "left",
                verticalAlign: "top",
                style: {
                  fontSize: labelFontSize,
                  fontWeight: "bold",
                  textOutline: "none",
                },
                formatter: function() {
                  // Calculate rectangle area to determine if label should be shown
                  const shapeArgs = this.point.shapeArgs;
                  let area = 0;
                  let shouldHideLabel = false;
                  
                  if (shapeArgs && shapeArgs.width && shapeArgs.height) {
                    area = shapeArgs.width * shapeArgs.height;
                    
                    // Calculate intelligent threshold based on font size and text length
                    const fontSize = parseInt(labelFontSize) || 14; // Default to 14px if parsing fails
                    const textLength = this.point.name.length;
                    
                    // Base threshold for minimum readable area
                    const baseThreshold = 2500;
                    
                    // Font size factor: larger fonts need more space
                    const fontSizeFactor = Math.pow(fontSize / 14, 1.5); // Exponential scaling for larger fonts
                    
                    // Text length factor: longer text needs more space
                    const textLengthFactor = Math.max(1, textLength / 8); // Scale based on 8 chars as baseline
                    
                    // Calculate dynamic threshold
                    const minAreaThreshold = baseThreshold * fontSizeFactor * textLengthFactor;
                    
                    // Debug logging for area calculation
                    debugLog(enableDebugLogging, `🔍 AREA DEBUG: Point "${this.point.name}" - width: ${shapeArgs.width}, height: ${shapeArgs.height}, area: ${area}`);
                    debugLog(enableDebugLogging, `🔍 THRESHOLD DEBUG: fontSize: ${fontSize}, textLength: ${textLength}, fontSizeFactor: ${fontSizeFactor.toFixed(2)}, textLengthFactor: ${textLengthFactor.toFixed(2)}, threshold: ${minAreaThreshold.toFixed(0)}`);
                    
                    // Hide label if rectangle is too small
                    if (area < minAreaThreshold) {
                      debugLog(enableDebugLogging, `🚫 HIDING LABEL: "${this.point.name}" (area: ${area} < threshold: ${minAreaThreshold.toFixed(0)})`);
                      shouldHideLabel = true;
                    } else {
                      debugLog(enableDebugLogging, `✅ SHOWING LABEL: "${this.point.name}" (area: ${area} >= threshold: ${minAreaThreshold.toFixed(0)})`);
                    }
                  } else {
                    debugLog(enableDebugLogging, `⚠️ WARNING: shapeArgs is undefined for point "${this.point.name}" - showing label by default`);
                  }
                  
                  // Hide label if rectangle is too small
                  if (shouldHideLabel) {
                    return '';
                  }
                  
                  // Get the background color of this treemap segment
                  // Try multiple ways to get the color since it might be set differently in heatmap vs non-heatmap mode
                  const backgroundColor = this.point.color || this.color || this.series.color || '#FFFFFF';
                  const textColor = getContrastColor(backgroundColor);
                  
                  debugLog(enableDebugLogging, `🔍 DEBUG: Formatter - point: ${this.point.name}, area: ${area}, backgroundColor: ${backgroundColor}, textColor: ${textColor}`);
                  
                  if (showValues && this.point.value !== undefined) {
                    // Get the measure column ID for formatting
                    const measureColumnId = measures[this.point.level] || measures[0];
                    let displayValue;
                    
                    if (labelStyle === 'percent' && this.point.percentage !== undefined) {
                      // Show percentage with 1 decimal place
                      displayValue = `${this.point.percentage.toFixed(1)}%`;
                    } else {
                      // Show formatted numeric value
                      displayValue = formatNumberWithMask(this.point.value, columnInfo, measureColumnId);
                    }
                    
                    return `<span style="font-size: ${labelFontSize}; font-weight: bold; color: ${textColor};">${this.point.name}</span><br/><span style="font-size: ${valueFontSize}; font-weight: normal; color: ${textColor};">${displayValue}</span>`;
                  }
                  return `<span style="color: ${textColor};">${this.point.name}</span>`;
                },
              },
            },
          ],
          type: "treemap",
          allowDrillToNode: false, // Disable Highcharts built-in drill functionality
          layoutAlgorithm: "squarified",
          dataLabels: {
            enabled: true,
          },
          data: data,
          point: {
            events: {
              click: function() {
                const point = this;
                const currentLevel = drillState.currentLevel;
                const drillPath = drillState.drillPath;
                let canDrill = false;
                
                if (dimensions.length === 3) {
                  if (currentLevel === 0) {
                    // Initial view: clicking on a region drills to show that region's states and cities
                    if (point.level === 0) {
                      setDrillStateWithLogging({
                        currentLevel: 1,
                        drillPath: [point.name]
                      });
                      canDrill = true;
                    }
                    // Clicking on a state in initial view drills to show that state's cities
                    else if (point.level === 1) {
                      // Find the region for this state
                      const idParts = point.id.split(delim);
                      if (idParts.length >= 4) {
                        const region = idParts[1]; // Region is the second part of the ID
                        setDrillStateWithLogging({
                          currentLevel: 2,
                          drillPath: [region, point.name]
                        });
                        canDrill = true;
                      }
                    }
                  } else if (currentLevel === 1) {
                    // Region view: clicking on a state drills to show that state's cities
                    if (point.level === 1) {
                      setDrillStateWithLogging({
                        currentLevel: 2,
                        drillPath: [drillPath[0], point.name]
                      });
                      canDrill = true;
                    }
                  }
                } else if (dimensions.length === 2) {
                  // For 2-level hierarchy, can drill from first level to second
                  if (point.level === 0) {
                    canDrill = true;
                    // Add drill functionality for 2-level if needed
                  }
                } else if (dimensions.length === 1) {
                  // Single level - no drilling possible
                  canDrill = false;
                }
                
                // If drilling is not possible and a control is configured, set the control value
                if (!canDrill && hasTileClickControl) {
                  handleTileClick(point.name);
                }
              }
            }
          }
        },
      ],
    };
    return options;
  }, [config, sigmaData, enableHeatmap, showValues, enableDebugLogging, labelFontSize, valueFontSize, colorPalette, labelStyle, drillState, hasTileClickControl, handleTileClick]);

  // Function to handle drill back
  const handleDrillBack = () => {
    if (drillState.currentLevel > 0) {
      if (drillState.currentLevel === 1) {
        // From region view (level 1) back to initial view (level 0)
        setDrillStateWithLogging({
          currentLevel: 0,
          drillPath: []
        });
      } else if (drillState.currentLevel === 2) {
        // From state view (level 2) back to region view (level 1)
        const newDrillPath = drillState.drillPath.slice(0, -1);
        setDrillStateWithLogging({
          currentLevel: 1,
          drillPath: newDrillPath
        });
      }
    }
  };

  return (
    <div>
      {drillState.currentLevel > 0 && (
        <div className="mb-4">
          <button 
            onClick={handleDrillBack}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            ← Back to {drillState.currentLevel === 1 ? 'All Regions' : 'Region View'}
          </button>
          <span className="ml-4 text-sm text-gray-600">
            Path: {drillState.drillPath.join(' → ')}
          </span>
        </div>
      )}
      <HighchartsReact 
        highcharts={Highcharts} 
        options={options} 
        ref={ref} 
      />
    </div>
  );
}

export default App;

