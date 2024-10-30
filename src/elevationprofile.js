/* eslint-disable no-undef */
import ol_control_Profile from 'ol-ext/control/Profile';
import ol_style_Style from 'ol/style/Style.js'

const Button = Origo.ui.Button;
const dom = Origo.ui.dom;
const GeoJSON = Origo.ol.format.GeoJSON;
const VectorLayer = Origo.ol.layer.Vector;
const VectorSource = Origo.ol.source.Vector;
const Style = Origo.ol.style.Style;
const Circle = Origo.ol.style.Circle;
const Fill = Origo.ol.style.Fill;
const Stroke = Origo.ol.style.Stroke;
const Feature = Origo.ol.Feature;
const Point = Origo.ol.geom.Point;
const LineString = Origo.ol.geom.LineString;
const topology = Origo.Utils.topology;
const Infowindow = Origo.components.Infowindow;

const ElevationProfile = function ElevationProfile(viewer, options = {}) {
  const {
    profileTarget = 'default', // Defaults to a floating element, can be the infowindow or an element id
    useElevationService = false,
    elevationServiceUrl,
    profileMeasure = true,
    zoomable = false,
    selectable = true,
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
    }
  } = options;
  let {
    width = 480,
    height = 180,
    profileLayers = []
  } = options;

  const style = [
    new Style({
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
      zIndex: Infinity
    })
  ];
  const selStyle = [
    new Style({
      stroke: new Stroke({
        color: [0, 153, 255],
        width: 4
      })
    })
  ];
  let map;
  let pt;
  let vectorSource;
  let vectorLayer;
  let profile;
  let iwCmp;
  let profileEl;
  let defaultTarget;
  let selection;
  let start = 0;

  function drawPoint(e) {
    if (!pt) return;
    if (e.type === 'over') {
      pt.setGeometry(new Point(e.coord));
      pt.setStyle(null);
    } else {
      pt.setStyle([]);
    }
  }

  const getTargetEl = function getTargetEl(target) {
    let targetEl;
    if (target instanceof Node) {
      targetEl = target;
    } else if (typeof target === "string") {
      targetEl = document.getElementById(target) || iwCmp.getContentElement();
    } else {
      targetEl = iwCmp.getContentElement();
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
      let span = document.createElement('span');
      li.appendChild(span);
      container.appendChild(li);
      const profileButton = createProfileButton();
      span.appendChild(dom.html(profileButton.render()));
      span.addEventListener("click", function () {
        const el = renderProfile(feature);
        if (targetEl === iwCmp.getContentElement()) {
          iwCmp.show();
        };
        targetEl.appendChild(el);
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
        let span = document.createElement('span');
        li.appendChild(span);
        container.appendChild(li);
        const profileButton = createProfileButton();
        span.appendChild(dom.html(profileButton.render()));
        span.addEventListener("click", async function () {
          var simplifiedGeom = topology.simplify(lineFeature.getGeometry(), lineFeature.getGeometry().getLength() / 1000);
          lineFeature.getGeometry().setCoordinates(simplifiedGeom);
          var densifiedGeom = topology.densify(lineFeature.getGeometry());
          lineFeature.getGeometry().setCoordinates(densifiedGeom);
          const zLine = await addElevationFromService(lineFeature);
          const el = renderProfile(zLine);
          if (targetEl === iwCmp.getContentElement()) {
            iwCmp.show();
          };
          targetEl.appendChild(el);
        });
      };
    };
  };

  function createProfileButton() {
    return Button({
      cls: 'padding-small margin-bottom-smaller icon-smaller round light box-shadow o-tooltip margin-right-small ',
      icon: '#ic_elevation_24px',
    });
  }

  function addListeners() {
    if (profileLayers === 'all' || (Array.isArray(profileLayers) && profileLayers.length > 0)) {
      // If infowindow is overlay
      viewer.getFeatureinfo().on('itemadded', function (e) {
        if (e && e.layer) {
          const layerName = e.layer.get('name')
          if (profileLayers === 'all' || profileLayers.includes(layerName)) {
            addLink(e.feature, e.content.firstChild, profileTarget === 'infowindow' ? e.content.firstChild : defaultTarget);
          }
        }
      });
      // If infowindow is infowindow
      viewer.getSelectionManager().getSelectedItems().on('add', function (e) {
        if (e && e.element && e.element.layer) {
          const layerName = e.element.layer.get('name');
          if (profileLayers === 'all' || profileLayers.includes(layerName)) {
            addLink(e.element.feature, e.element.content.firstChild, profileTarget === 'infowindow' ? e.element.content.firstChild : defaultTarget);
          }
        }
      });
    }
  }


  const renderProfile = function renderProfile(feature) {
    if ((feature.getGeometry().getType() === 'LineString' || feature.getGeometry().getType() === 'MultiLineString') && (feature.getGeometry().getLayout() === 'XYZ' || feature.getGeometry().getLayout() === 'XYZM')) {
      var geom = feature.getGeometry();
      var coordArr = [];
      var coords = geom.getCoordinates();
      coords.forEach(function (c) { coordArr.push([c[0], c[1], Math.round(c[2] * 100) / 100]) })
      geom.setCoordinates(coordArr);
      profile.setGeometry(geom);
      profile.on(["over", "out"], function (e) {
        if (e.type == "over") profile.popup(Math.round(e.coord[2] * 100) / 100 + " m");
        drawPoint(e);
      });
      if (selection) {
        vectorSource.removeFeature(selection);
        selection = false;
      }
      profile.on('click', function () {
        if (selection) {
          vectorSource.removeFeature(selection);
          selection = false;
        }
      });
      profile.on('dragstart', function (e) {
        start = e.index;
      });
      profile.on(['dragend', 'dragging'], function (e) {
        var g = profile.getSelection(start, e.index);
        if (selection) {
          selection.getGeometry().setCoordinates(g);
        } else {
          selection = new Feature(new LineString(g));
          selection.set('select', true);
          vectorSource.addFeature(selection);
        }
      });
      profile.on('zoom', function (e) {
        setTimeout(function () {
          if (selection) vectorSource.removeFeature(selection);
          if (e.geometry) {
            selection = new Feature(e.geometry);
            selection.set('select', true);
            vectorSource.addFeature(selection);
          } else {
            selection = null;
          }
        })
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
      iwCmp = Infowindow({ viewer, type: 'floating', title: 'Höjdprofil', isActive: false });

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

      vectorSource = new VectorSource();
      vectorLayer = new VectorLayer({
        group: 'none',
        source: vectorSource,
        style: function (f) {
          return (f.get('select') ? selStyle : style);
        },
        name: 'elevationProfile',
        title: 'elevationProfile',
        visible: true
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
      vectorSource.addFeature(pt);

      map.addLayer(vectorLayer);
      map.addControl(profile);
    },
    onRender() {
    },
    render() {
      setDefaultTarget(profileTarget);
      iwCmp.on('toggle', function () {
        const status = iwCmp.getStatus();
        if (!status) {
          vectorSource.removeFeature(selection);
          selection = false;
        }
      });
      addListeners();
      this.dispatch('render');
    }
  });
};

if (window.Origo) {
  Origo.controls.ElevationProfile = ElevationProfile;
}

export default ElevationProfile;
