# elevation-profile-plugin
Elevation profile plugin for Origo. Shows profiles for linestrings or polygons that has z-dimension or gets z values from service. Will not work for multilinestrings/multipolygons.

#### Example usage of Elevation profile as plugin
Add .css and .js-file (after origo.js) and then config (defaults values in example):

index.html:

```javascript
<link href="plugins/elevation-profile.css" rel="stylesheet">
...
<script src="plugins/elevation-profile.min.js"></script>
```
```javascript
var origo = Origo('index.json');
origo.on('load', function(viewer) {
  var ep = ElevationProfile(viewer, {
    width: 480,
    height: 180,
    profileTarget: 'default', // Defaults to a floating element, can be the 'infowindow' of choice or an element id
    useElevationService: false,
    elevationServiceUrl: '', // eg 'origoserver/elevation/3006'
    profileMeasure: false, // make measure features queryable and elevated with the elevationService above
    zoomable: false,
    selectable: true,
    showGradient: true,
    showBreakpoints: false,
    densifyLines: true, // Densify features by adding breakpoints
    densifyMultiple: 1,
    simplifyLines: true, // Simplify features by removing dense breakpoints
    simplifyMultiple: 1,
    showButtons: true,
    autoClose: true,
    info: {
      zmin: 'Min höjd',
      zmax: 'Max höjd',
      ytitle: 'Höjd (m)',
      xtitle: 'Distans (km)',
      time: 'Tid',
      altitude: 'Höjd',
      distance: 'Distans',
      speed: 'Hastighet',
      totaltime: 'Totala tiden',
      realtime: 'Realtid',
      totaldistance: 'Totala distansen (km)',
      altitudeUnits: ' m',
      distanceUnitsM: ' m',
      distanceUnitsKM: ' km',
      speedUnit: ' km/h'
    },
    gradient: [
      [44, 132, 186],
      [250, 253, 189],
      [215, 26, 29]
    ],
    profileLayers: [] // Array of layers to enable the plugin for. Set to 'all' to enable it for every layer
    }
  });
  viewer.addComponent(ep);
});
```

To set up as a layer attribute in index.json:
```json
"layers": [
 {
  "name": "profile-layer-name",
  "attributes": [
   {
    "showProfile": true
   }
  ]
 }
]
```
