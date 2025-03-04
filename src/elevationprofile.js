/* eslint-disable no-undef */
import ol_control_Profile from 'ol-ext/control/Profile';
import ol_style_FlowLine from 'ol-ext/style/FlowLine.js'
import ol_style_Style from 'ol/style/Style.js';
import ol_layer_VectorImage from 'ol/layer/VectorImage.js';
import { addProjection, get, Projection, transform as ol_proj_transform } from 'ol/proj.js'

const Button = Origo.ui.Button;
const dom = Origo.ui.dom;
const GeoJSON = Origo.ol.format.GeoJSON;
const VectorLayer = Origo.ol.layer.Vector;
const VectorSource = Origo.ol.source.Vector;
const Style = Origo.ol.style.Style;
const Circle = Origo.ol.style.Circle;
const Fill = Origo.ol.style.Fill;
const Stroke = Origo.ol.style.Stroke;
const Text = Origo.ol.style.Text;
const Feature = Origo.ol.Feature;
const MultiPoint = Origo.ol.geom.MultiPoint;
const Point = Origo.ol.geom.Point;
const LineString = Origo.ol.geom.LineString;
const Infowindow = Origo.ui.FloatingPanel;
const El = Origo.ui.Element;
const Component = Origo.ui.Component;

const densify = function densify(geom, multiple = 1) {
  function densifyGeom(geometry, mult) {
    let maxLength = 100;
    const lineCoords = [];
    const length = geometry.getLength();
    if (length < 100) {
      maxLength = 5 / mult;
    } else if (length < 1000) {
      maxLength = 25 / mult;
    } else if (length < 10000) {
      maxLength = 50 / mult;
    }
    if (maxLength < 1) { maxLength = 1; }
    const coords = geometry.getCoordinates();
    lineCoords.push(coords[0]);
    geometry.forEachSegment((start, end) => {
      const segment = new LineString([start, end]);
      const segmentLength = segment.getLength();
      const splits = Math.ceil(segmentLength / maxLength);
      for (let i = 1; i < splits; i += 1) {
        const fraction = i / splits;
        const pt = segment.getCoordinateAt(fraction);
        lineCoords.push(pt);
      }
      lineCoords.push(end);
    });
    return lineCoords;
  }

  const densified = geom.clone();
  const densifiedCoords = densifyGeom(geom, multiple);
  if (densifiedCoords) {
    densified.setCoordinates(densifiedCoords);
  }
  return densified;
};

const simplify = function simplify(geom, tolerance = 1) {
  function sqSegDist(p, p1, p2) {
    const x0 = p[0];
    const x2 = p2[0];
    const y0 = p[1];
    const y2 = p2[1];
    const z0 = p[2] || 0;
    const z2 = p2[2] || 0;
    let x1 = p1[0];
    let y1 = p1[1];
    let z1 = p1[2] || 0;
    let dx = x2 - x1;
    let dy = y2 - y1;
    let dz = z2 - z1;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      const t = ((x0 - x1) * dx + (y0 - y1) * dy + (z0 - z1) * dz) / (dx * dx + dy * dy + dz * dz);
      if (t > 1) {
        x1 = x2;
        y1 = y2;
        z1 = z2;
      } else if (t > 0) {
        x1 += dx * t;
        y1 += dy * t;
        z1 += dz * t;
      }
    }
    dx = x0 - x1;
    dy = y0 - y1;
    dz = z0 - z1;
    return dx * dx + dy * dy + dz * dz;
  }

  function simplifyDP(geometry, sqTolerance) {
    const points = geometry.getCoordinates();
    const len = points.length;
    const pArr = new Array(len);
    const stack = [];
    const newPoints = [];
    let first = 0;
    let last = len - 1;
    let i;
    let maxSqDist;
    let sqDist;
    let index;
    pArr[first] = 1;
    pArr[last] = 1;

    while (last) {
      maxSqDist = 0;
      for (i = first + 1; i < last; i += 1) {
        sqDist = sqSegDist(points[i], points[first], points[last]);
        if (sqDist > maxSqDist) {
          index = i;
          maxSqDist = sqDist;
        }
      }
      if (maxSqDist > sqTolerance) {
        pArr[index] = 1;
        stack.push(first, index, index, last);
      }
      last = stack.pop();
      first = stack.pop();
    }
    for (i = 0; i < len; i += 1) {
      if (pArr[i]) {
        newPoints.push(points[i]);
      }
    }
    return newPoints;
  }

  function simplifyGeom(geometry, tol) {
    const sqTolerance = tol * tol || 1;
    const points = simplifyDP(geometry, sqTolerance);
    return points;
  }

  const simplified = geom.clone();
  const simplifiedCoords = simplifyGeom(geom, tolerance);
  if (simplifiedCoords) {
    simplified.setCoordinates(simplifiedCoords);
  }
  return simplified;
};

const ElevationProfile = function ElevationProfile(viewer, options = {}) {
  const {
    profileTarget = 'default', // Defaults to a floating element, can be the infowindow or an element id
    useElevationService = false,
    elevationServiceUrl,
    profileMeasure = false,
    zoomable = false,
    selectable = true,
    showGradient = true,
    showBreakpoints = false,
    densifyLines = true,
    simplifyLines = true,
    simplifyMultiple = 1,
    showButtons = true,
    autoClose = true,
    info = {
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
    gradient = [
      [44, 132, 186],
      [250, 253, 189],
      [215, 26, 29]
    ]
  } = options;
  let {
    width = 480,
    height = 180,
    profileLayers = [],
    densifyMultiple = 1
  } = options;

  let map;
  let pt;
  let ptLine;
  let elevationSource;
  let selectionSource;
  let elevationLayer;
  let selectionLayer;
  let profile;
  let iwCmp;
  let profileEl;
  let defaultTarget;
  let selection;
  let start = 0;
  let sourceProj;
  let min;
  let max;
  let iwContentId;
  let iwContentEl;
  let styleButtons = [];

  densifyMultiple = densifyMultiple > 5 ? 5 : densifyMultiple;

  const getText = function (feature) {
    const z = feature.getGeometry().getCoordinates()[2];
    return z + 'm';
  };

  function circleStyleFunction(feature) {
    return new Style({
      image: new Circle({
        radius: 8,
        fill: new Fill({
          color: [0, 153, 255]
        }),
        stroke: new Stroke({
          color: [255, 255, 255],
          width: 2
        })
      }),
      text: new Text({
        text: getText(feature).toString(),
        textAlign: 'left',
        font: 'bold 14px Arial',
        fill: new Fill({ color: '#000000' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
        offsetX: 10
      }),
      zIndex: Infinity
    });
  };

  const selectionStyle = [
    new Style({
      stroke: new Stroke({
        color: [255, 255, 255],
        width: 6
      })
    }),
    new Style({
      stroke: new Stroke({
        color: [0, 153, 255],
        width: 4
      })
    })
  ];

  const lineStyle = [
    new Style({
      stroke: new Stroke({
        color: [255, 255, 255],
        width: 4
      })
    }),
    new Style({
      stroke: new Stroke({
        color: [0, 0, 0],
        width: 2
      })
    })
  ];

  function dist2d(p1, p2) {
    var dx = p1[0] - p2[0];
    var dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getHex(c1, c2, weight) {
    var p = weight;
    var w = p * 2 - 1;
    var w1 = (w / 1 + 1) / 2;
    var w2 = 1 - w1;
    var rgb = [Math.round(c1[0] * w1 + c2[0] * w2),
    Math.round(c1[1] * w1 + c2[1] * w2),
    Math.round(c1[2] * w1 + c2[2] * w2)];
    return rgb;
  }

  function getMinMax(geom) {
    max = undefined;
    min = undefined;
    geom.getCoordinates().forEach(function (p) {
      max = Math.max(max || -Infinity, p[2]);
      min = Math.min(min || Infinity, p[2]);
    });
    max = Math.round(max / 10 + .4) * 10;
    min = Math.round(min / 10 - .4) * 10;
  }

  function getGradientColor(p) {
    var l = gradient.length - 1;
    const rel = (p[2] - min) / (max - min);
    var step = 1 / l;
    var res = Math.floor(rel / step);
    if (res < 0) { res = 0 }
    if (l < res + 1) { res = l - 1 }
    var firstcolor = gradient[res];
    var secondcolor = gradient[res + 1];
    var ratio = (rel - (res * step)) / step;
    var result = getHex(secondcolor, firstcolor, ratio);
    return result;
  }

  function getSegmentColor(s, e) {
    var l = gradient.length - 1;
    const avg = (s[2] + e[2]) / 2;
    const rel = (avg - min) / (max - min);
    var step = 1 / l;
    var res = Math.floor(rel / step);
    if (res < 0) { res = 0 }
    if (l < res + 1) { res = l - 1 }
    var firstcolor = gradient[res];
    var secondcolor = gradient[res + 1];
    var ratio = (rel - (res * step)) / step;
    var result = getHex(secondcolor, firstcolor, ratio);
    return result;
  }

  function getSteepnessColor(slope) {
    let s = slope;
    if (s > 0 || s === 0) { }
    else { s = 0 }
    const sMin = 0
    const sMax = 0.2
    if (s < sMin) { s = sMin }
    if (s > sMax) { s = sMax }
    var l = gradient.length - 1;
    const rel = (s - sMin) / (sMax - sMin);
    var step = 1 / l;
    var res = Math.floor(rel / step);
    if (res < 0) { res = 0 }
    if (l < res + 1) { res = l - 1 }
    var firstcolor = gradient[res];
    var secondcolor = gradient[res + 1];
    var ratio = (rel - (res * step)) / step;
    var result = getHex(secondcolor, firstcolor, ratio);
    return result;
  }

  const elevationStyle = function (feature) {
    const geometry = feature.getGeometry();
    const styles = [
      new Style({
        stroke: new Stroke({
          color: '#CCCCCC',
          width: 7,
        }),
      }),
    ];

    let geom;
    if (geometry.getType() === 'MultiLineString') {
      geom = geometry.getLineString(0)
    } else {
      geom = geometry;
    }
    getMinMax(geom);
    let first = true;
    geom.forEachSegment(((start, end) => {
      if (showGradient) {
        const color = getSegmentColor(start, end);
        const lineString = new LineString([start, end]);
        styles.push(new Style({
          geometry: lineString,
          fill: new Fill({
            color: color
          }),
          stroke: new Stroke({
            color: color,
            width: 5
          })
        }));
      }
      if (showBreakpoints) {
        if (first) {
          styles.push(
            new Style({
              geometry: new Point(start),
              image: new Circle({
                radius: 4,
                fill: new Fill({
                  color: getGradientColor(start),
                })
              }),
            }),
          );
          first = false;
        }
        styles.push(
          new Style({
            geometry: new Point(end),
            image: new Circle({
              radius: 4,
              fill: new Fill({
                color: getGradientColor(end),
              })
            }),
          }),
        );
      }
    }))
    return styles;
  };

  const elevationPointStyle = function (feature) {
    const geometry = feature.getGeometry();
    const styles = [];
    lineStyle.forEach(s => styles.push(s));
    let geom;
    if (geometry.getType() === 'MultiLineString') {
      geom = geometry.getLineString(0)
    } else {
      geom = geometry;
    }
    getMinMax(geom);
    let first = true;
    geom.forEachSegment(((start, end) => {
      if (first) {
        styles.push(
          new Style({
            geometry: new Point(start),
            image: new Circle({
              radius: 6,
              fill: new Fill({
                color: getGradientColor(start),
              })
            }),
          }),
        );
        first = false;
      }
      styles.push(
        new Style({
          geometry: new Point(end),
          image: new Circle({
            radius: 6,
            fill: new Fill({
              color: getGradientColor(end),
            })
          }),
        }),
      );
    }))
    return styles;
  };

  const steepnessStyle = function (feature) {
    const geometry = feature.getGeometry();
    const styles = [
      new Style({
        stroke: new Stroke({
          color: '#CCCCCC',
          width: 7,
        }),
      }),
    ];
    let geom;
    if (geometry.getType() === 'MultiLineString') {
      geom = geometry.getLineString(0)
    } else {
      geom = geometry;
    }
    let first = true;
    geom.forEachSegment(((start, end) => {
      const dist = dist2d(start, end);
      const dZ = Math.abs(start[2] - end[2]);
      const slope = dZ / dist;
      const color = getSteepnessColor(slope);
      const lineString = new LineString([start, end]);
      styles.push(new Style({
        geometry: lineString,
        fill: new Fill({
          color: color
        }),
        stroke: new Stroke({
          color: color,
          width: 5,
          lineCap: 'square',
          lineJoin: 'round'
        })
      }));
    }))

    return styles;
  };

  function drawPoint(e) {
    if (!pt) return;
    if (e.type === 'over') {
      pt.setGeometry(new Point(e.coord).transform('EPSG:4326', sourceProj));
      pt.setStyle(null);
    } else {
      pt.setStyle([]);
    }
  }

  function drawLine(e) {
    if (!ptLine) return;
    if (e.type === 'over') {
      let geom;
      const geometry = profile?._geometry[0];
      if (geometry.getType() === 'MultiLineString') {
        geom = geometry.getLineString(0)
      } else {
        geom = geometry;
      }
      const coords = geom?.getCoordinates();
      if (coords && coords.length > 1 && e.index) {
        const startCoord = coords[e.index === 0 ? e.index : e.index - 1];
        const endCoord = coords[e.index];
        if (startCoord && endCoord) {
          ptLine.setGeometry(new LineString([startCoord, endCoord]).transform('EPSG:4326', sourceProj));
          ptLine.setStyle(lineStyle);
        } else {
          ptLine.setStyle([]);
        }
      }
    } else {
      ptLine.setStyle([]);
    }
  }

  const getTargetEl = function getTargetEl(target) {
    let targetEl;
    if (target instanceof Node) {
      targetEl = target;
    } else if (typeof target === "string") {
      targetEl = document.getElementById(target) || iwContentEl;
    } else {
      targetEl = iwContentEl;
    }
    return targetEl;
  }

  const setDefaultTarget = function setDefaultTarget(target) {
    const el = getTargetEl(target);
    if (el instanceof Node) {
      defaultTarget = el;
    }
  }

  const getDefaultTarget = function getDefaultTarget() {
    return defaultTarget;
  }

  const addElevationFromService = async function addElevationFromService(feature) {
    const clone = feature.clone();
    const format = new GeoJSON();
    const line = format.writeFeatureObject(feature);
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    const response = await fetch(elevationServiceUrl, {
      method: "POST",
      body: JSON.stringify(line.geometry),
      headers: headers,
    }).then(response => response.json())
      .then(data => {
        clone.getGeometry().setCoordinates(data.geometry.coordinates);
        return clone;
      });
    return response;
  }

  function addLink(feature, container, target) {
    let targetEl = getTargetEl(target);
    const geom = feature.getGeometry();
    if ((geom.getType() === 'LineString' || geom.getType() === 'MultiLineString') && (geom.getLayout() === 'XYZ' || geom.getLayout() === 'XYZM')) {
      let li = document.createElement('li');
      let div = document.createElement('div');
      li.appendChild(div);
      container.appendChild(li);
      const profileButton = createButton('#ic_elevation_24px', 'Visa höjdprofil');
      div.appendChild(dom.html(profileButton.render()));
      div.addEventListener("click", function () {
        const el = renderProfile(feature);
        targetEl.innerHTML = "";
        if (targetEl === iwContentEl) {
          iwCmp.show();
        };
        targetEl.appendChild(el);
        if (autoClose) {
          viewer.getFeatureinfo().clear();
        }
      });
    } else if ((geom.getType() === 'LineString' || geom.getType() === 'Polygon') && useElevationService && elevationServiceUrl) {
      let lineFeature;
      //Convert polygon to line
      if (geom.getType() === 'Polygon') {
        lineFeature = new Feature(new LineString(geom.getLinearRing(0).getCoordinates()));
      } else {
        lineFeature = feature.clone();
      }
      if (lineFeature.getGeometry().getLength() < 60000) {
        let li = document.createElement('li');
        let div = document.createElement('div');
        li.appendChild(div);
        container.appendChild(li);
        const profileButton = createButton('#ic_elevation_24px', 'Visa höjdprofil');
        div.appendChild(dom.html(profileButton.render()));
        div.addEventListener("click", async function () {
          if (simplifyLines) {
            const simplifiedGeom = simplify(lineFeature.getGeometry(), (simplifyMultiple * (lineFeature.getGeometry().getLength() / 1000)));
            lineFeature.setGeometry(simplifiedGeom);
          }
          if (densifyLines) {
            const densifiedGeom = densify(lineFeature.getGeometry(), densifyMultiple);
            lineFeature.setGeometry(densifiedGeom);
          }
          const zLine = await addElevationFromService(lineFeature);
          const el = renderProfile(zLine);
          targetEl.innerHTML = "";
          if (targetEl === iwContentEl) {
            iwCmp.show();
          };
          targetEl.appendChild(el);
          if (autoClose) {
            viewer.getFeatureinfo().clear();
          }
        });
      };
    };
  };

  function createButton(icon, tooltipText) {
    return Button({
      cls: 'flex relative padding-smaller margin-smaller icon-smaller round light box-shadow o-tooltip ',
      icon,
      tooltipText
    });
  }

  function addListeners() {
    if (profileLayers === 'all' || (Array.isArray(profileLayers) && profileLayers.length > 0)) {
      viewer.getFeatureinfo().on('itemadded', function (e) {
        if (e && e.layer) {
          const layerName = e.layer.get('name')
          if (profileLayers === 'all' || profileLayers.includes(layerName)) {
            addLink(e.feature, e.content.lastChild, profileTarget === 'infowindow' ? e.content.firstChild : defaultTarget);
          }
        }
      });
      viewer.getSelectionManager().getSelectedItems().on('add', function (e) {
        if (e && e.element && e.element.layer) {
          const layerName = e.element.layer.get('name');
          if (profileLayers === 'all' || profileLayers.includes(layerName)) {
            addLink(e.element.feature, e.element.content.lastChild, profileTarget === 'infowindow' ? e.element.content.firstChild : defaultTarget);
          }
        }
      });
    }
  }

  const renderProfile = function renderProfile(feature) {
    const clone = feature.clone();
    if ((clone.getGeometry().getType() === 'LineString' || clone.getGeometry().getType() === 'MultiLineString') && (clone.getGeometry().getLayout() === 'XYZ' || clone.getGeometry().getLayout() === 'XYZM')) {
      const geom = clone.getGeometry();
      // Transform to 4326
      const coords = geom.transform(sourceProj, 'EPSG:4326').getCoordinates();
      if (geom.getType() === 'LineString') {
        coords.forEach(function (c) { c[2] = Math.round(c[2] * 100) / 100 })
        const fclone = feature.clone();
        if (densifyLines) {
          const densifiedGeom = densify(fclone.getGeometry(), densifyMultiple);
          fclone.setGeometry(densifiedGeom);
        }
        elevationSource.clear();
        elevationSource.addFeature(fclone);
      }
      if (geom.getType() === 'MultiLineString') {
        for (let i = 0; i < coords.length; i++) {
          coords[i].forEach(function (c) { c[2] = Math.round(c[2] * 100) / 100 })
        }
        const fclone = feature.clone();
        if (densifyLines) {
          const densifiedGeom = densify(fclone.getGeometry().getLineString(0), densifyMultiple);
          fclone.setGeometry(densifiedGeom);
        }
        elevationSource.clear();
        elevationSource.addFeature(fclone);
      }
      geom.setCoordinates(coords);
      profile.setGeometry(geom);
      profile.on(["over", "out"], function (e) {
        if (e.type == "over") profile.popup(Math.round(e.coord[2] * 100) / 100 + " m");
        drawPoint(e);
        drawLine(e);
      });
      if (selection) {
        selectionSource.removeFeature(selection);
        selection = false;
      }
      profile.on('click', function () {
        if (selection) {
          selectionSource.removeFeature(selection);
          selection = false;
        }
      });
      profile.on('dragstart', function (e) {
        start = e.index;
      });
      profile.on(['dragend', 'dragging'], function (e) {
        let end = e.index;
        const g = start > end ? profile.getSelection(start - 1, end) : profile.getSelection(start, end - 1);
        if (selection) {
          selection.getGeometry().setCoordinates(g);
          selection.setGeometry(selection.getGeometry().transform('EPSG:4326', sourceProj));
        } else {
          selection = new Feature(new LineString(g).transform('EPSG:4326', sourceProj));
          selection.set('select', true);
          selectionSource.addFeature(selection);
        }
      });
      return profileEl;
    }
    return false;
  }

  /**
   * API function for rendering elevation profile
   * @param {any} feature
   * @param {any} target Can be floating or overlay(default)
   */
  const showElevationProfile = function showElevationProfile(feature, target) {
    const el = renderProfile(feature);
    if (el) {
      switch (target) {
        case 'floating':
          {
            iwCmp.getContentElement().appendChild(el);
            iwCmp.show();
            break;
          }
        case 'overlay':
        default:
          {
            const featureInfo = viewer.getControlByName('featureInfo');
            const obj = {};
            obj.feature = feature;
            obj.title = 'Markhöjd profil';
            obj.content = el;
            const extent = feature.getGeometry().getExtent();
            const center = (extent[0] + extent[2]) / 2;
            featureInfo.render([obj], 'overlay', [center, extent[3]], { ignorePan: true });
            break;
          }
      }
    }
  }

  // Function for showProfile attribute in featureinfo, must return list element
  const showProfileInFeatureinfo = function showProfileInFeatureinfo(feature, attribute) {
    if (attribute.showProfile) {
      const el = renderProfile(feature);
      const li = document.createElement('li');
      li.appendChild(el)
      return li;
    }
    return false;
  };

  const toggleState = function toggleState(t) {
    styleButtons.forEach(b => { b.setState('initial') });
    t.setState('active');
  };

  return Origo.ui.Component({
    name: 'elevationProfile',
    addElevationFromService,
    getDefaultTarget,
    setDefaultTarget,
    getProfile() { return profile; },
    renderProfile,
    showElevationProfile,
    onAdd() {
      this.addComponent(iwCmp);
      this.render();
    },
    onInit() {
      viewer.getControlByName('featureInfo').addAttributeType('showProfile', showProfileInFeatureinfo);
      map = viewer.getMap();
      sourceProj = map.getView().getProjection().getCode();
      const lineButton = Button({
        cls: 'margin-left-small relative padding-small margin-bottom-smaller icon-smaller round light box-shadow o-tooltip margin-right-small ',
        icon: '#ic_visibility_off_24px',
        click() {
          elevationLayer.setStyle(lineStyle);
          toggleState(this);
        },
        tooltipText: 'Linje',
        tooltipPlacement: 'north'
      });
      const elevationPointButton = Button({
        cls: 'relative padding-small margin-bottom-smaller icon-smaller round light box-shadow o-tooltip margin-right-small ',
        icon: '#ic_linear_scale_24px',
        click() {
          elevationLayer.setStyle(elevationPointStyle);
          toggleState(this);
        },
        tooltipText: 'Punkter',
        tooltipPlacement: 'north'
      });
      const elevationButton = Button({
        cls: 'relative padding-small margin-bottom-smaller icon-smaller round light box-shadow o-tooltip margin-right-small ',
        icon: '#ic_elevation_24px',
        state: 'active',
        click() {
          elevationLayer.setStyle(elevationStyle);
          toggleState(this);
        },
        tooltipText: 'Höjd',
        tooltipPlacement: 'north'
      });
      const steepnessButton = Button({
        cls: 'relative padding-small margin-bottom-smaller icon-smaller round light box-shadow o-tooltip margin-right-small ',
        icon: '#ic_percent_24px',
        click() {
          elevationLayer.setStyle(steepnessStyle);
          toggleState(this);
        },
        tooltipText: 'Lutning',
        tooltipPlacement: 'north'
      });
      const divEl = Origo.ui.Element({
        tagName: 'div',
        cls: 'padding-y padding-x overflow-auto text-small'
      })
      const contentComponent = Origo.ui.Element({
        tagName: 'div',
        cls: 'padding-y padding-x overflow-auto text-small',
        components: [divEl]
      });
      styleButtons = [lineButton, elevationPointButton, elevationButton, steepnessButton];
      contentComponent.addComponents(styleButtons);
      iwCmp = Infowindow({
        viewer,
        type: 'floating',
        title: 'Höjdprofil',
        isActive: false,
        contentComponent
      });
      iwContentId = divEl.getId();
      if (width > 220) {
        if (profileTarget === 'infowindow') { width = 220; }
        if (width > window.innerWidth) { width = 220; }
      }
      height = height < window.innerHeight - 20 ? height : window.innerHeight - 20;

      if (profileMeasure && elevationServiceUrl && viewer.getLayersByProperty('name', 'measure').length > 0) {
        viewer.getLayersByProperty('name', 'measure')[0].set('queryable', true);
        // Ensure measure features will get a profile link
        if ((Array.isArray(profileLayers))) {
          if (!profileLayers.includes('measure')) {
            profileLayers.push('measure');
          }
        }
        else if (profileLayers !== 'all') {
          profileLayers = ['measure'];
        }
      }
      selectionSource = new VectorSource();
      selectionLayer = new VectorLayer({
        group: 'none',
        source: selectionSource,
        style: function (f) {
          return (f.get('select') ? selectionStyle : circleStyleFunction(f));
        },
        name: 'elevationProfile',
        title: 'elevationProfile',
        visible: true,
        zIndex: 21
      });



      elevationSource = new VectorSource();
      elevationLayer = new VectorLayer({
        group: 'none',
        source: elevationSource,
        style: elevationStyle,
        name: 'elevationProfile2',
        title: 'elevationProfile2',
        visible: true,
        zIndex: 20
      });

      profileEl = document.createElement('span');
      profileEl.classList.add('o-profile');
      profile = new ol_control_Profile({
        target: profileEl,
        width,
        height,
        zoomable,
        selectable,
        info,
        style: new ol_style_Style({
          fill: new Fill({ color: '#0099FF55' }),
          stroke: new Stroke({
            color: [0, 153, 255],
            width: 2
          })
        })
      });
      pt = new Feature(new Point([0, 0]));
      pt.setStyle([]);
      selectionSource.addFeature(pt);
      ptLine = new Feature(new LineString([0, 0]));
      ptLine.setStyle([]);
      selectionSource.addFeature(ptLine);
      map.addLayer(elevationLayer);
      map.addLayer(selectionLayer);
      map.addControl(profile);
    },
    onRender() {
    },
    render() {
      setDefaultTarget(profileTarget);
      iwCmp.on('hide', function () {
        selectionSource.removeFeature(selection);
        selection = false;
        elevationSource.clear();
      });
      addListeners();
      this.dispatch('render');
      iwContentEl = document.getElementById(iwContentId);
    }
  });
};

if (window.Origo) {
  Origo.controls.ElevationProfile = ElevationProfile;
}

export default ElevationProfile;
