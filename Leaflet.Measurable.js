L.GeoUtil = L.extend(L.GeoUtil || {}, {
    // Ported from the OpenLayers implementation. See https://github.com/openlayers/openlayers/blob/master/lib/OpenLayers/Geometry/LinearRing.js#L270
    geodesicArea: function (latLngs) {
        var pointsCount = latLngs.length,
            area = 0.0,
            d2r = Math.PI / 180,
            p1, p2;

        if (pointsCount > 2) {
            for (var i = 0; i < pointsCount; i++) {
                p1 = latLngs[i];
                p2 = latLngs[(i + 1) % pointsCount];
                area += ((p2.lng - p1.lng) * d2r) *
                        (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
            }
            area = area * L.Projection.SphericalMercator.R * L.Projection.SphericalMercator.R / 2.0;
        }

        return Math.abs(area);
    },

    readableArea: function (area, unit) {
        var areaStr;

        if (unit === 'mi') {
            // Square yards in 1 meter
            area /= 0.836127;
            //3097600 square yards in 1 square mile
            if (area >= 3097600) areaStr = L._('{area} mi&sup2;', {area: (area / 3097600).toFixed(2)});
            //48040 square yards in 1 acre
            else if (area >= 4840) areaStr = L._('{area} acres', {area: (area / 4840).toFixed(2)});
            else areaStr = L._('{area} yd&sup2;'), {area: Math.ceil(area)};
        } else {
            if (area >= 10000) areaStr = L._('{area} ha', {area: (area * 0.0001).toFixed(2)});
            else areaStr = L._('{area} m&sup2;', {area: area.toFixed(2)});
        }

        return areaStr;
    },

    readableDistance: function (distance, unit) {
        var distanceStr;

        if (unit === 'mi') {
            distance *= 1.09361;
            if (distance > 1760) distanceStr = L._('{distance} miles', {distance: (distance / 1760).toFixed(2)});
            else distanceStr = L._('{distance} yd', {distance: Math.ceil(distance)});
        } else if (unit === 'nm') {
            distance /= 1852;
            distanceStr = L._('{distance} NM', {distance: Math.ceil(distance)});
        } else {
            if (distance > 10000) distanceStr = L._('{distance} km', {distance: Math.ceil(distance / 1000)});
            else if (distance > 1000) distanceStr = L._('{distance} km', {distance: (distance / 1000).toFixed(2)});
            else distanceStr = L._('{distance} m', {distance: Math.ceil(distance)});
        }

        return distanceStr;
    },

    lineLength: function (map, latlngs) {
        var distance = 0, latlng, previous;
        for (var i = 0; i < latlngs.length; i++) {
            latlng = latlngs[i];
            if (previous) {
                distance += map.distance(latlng, previous);
            }
            previous = latlng;
        }
        return distance;
    }

});

L.MeasureLine = L.Polyline.extend({
    options: {
        color: '#222',
        weight: 1
    }
});

L.MeasureVertex = L.Editable.VertexMarker.extend({
    options: {
        className: 'leaflet-div-icon leaflet-editing-icon leaflet-measure-edge'
    }
});

L.Measurable = L.Editable.extend({

    options: {
        vertexMarkerClass: L.MeasureVertex,
        polylineClass: L.MeasureLine,
        lineGuideOptions: {
            color: '#222'
        },
        skipMiddleMarkers: true
    },

    initialize: function (map, options) {
        L.Editable.prototype.initialize.call(this, map, options);
        map.measureTools = this;
        this.on('editable:editing', function (e) {
            var latlng, latlngs = e.layer._defaultShape();
            for (var i = 0; i < latlngs.length; i++) {
                latlng = latlngs[i];
                latlng.__vertex.closeTooltip();
            }
            if (latlng && latlng.__vertex) {
                var length = L.GeoUtil.lineLength(map, e.layer._defaultShape());
                latlng.__vertex.bindTooltip(L.GeoUtil.readableDistance(length, this.getMeasureUnit()), {permanent: true}).openTooltip();
            }
        });
        this.on('editable:drawing:end', function () {
            if (this.enabled()) this.startPolyline();
        });
        this.on('editable:shape:deleted', function (e) {
            if (!e.layer._defaultShape().length) e.layer.remove();
        });
    },

    toggle: function() {
        if (this.enabled()) this.disable();
        else this.enable();
    },

    enable: function () {
        if (this.map.editTools) this.map.editTools.on('editable:drawing:start', this.disable, this);
        L.DomUtil.addClass(this.map._container, 'measure-enabled');
        this.fireAndForward('showmeasure');
        this.startPolyline();
    },

    disable: function () {
        if (this.map.editTools) this.map.editTools.off('editable:drawing:start', this.disable, this);
        L.DomUtil.removeClass(this.map._container, 'measure-enabled');
        this.featuresLayer.clearLayers();
        this.unregisterForDrawing();
        this.fireAndForward('hidemeasure');
    },

    enabled: function () {
        return L.DomUtil.hasClass(this.map._container, 'measure-enabled');
    },

    getMeasureUnit: function () {
        return document.querySelector('input[name=unit]:checked').value;
    }

});

L.MeasureControl = L.Control.extend({

    options: {
        position: 'topleft'
    },

    addUnit: function (container, value, short, long, selected) {
        var input = L.DomUtil.create('input', '', container);
        input.type = 'radio';
        input.id = value;
        input.name = 'unit';
        input.value = value;
        if (selected) input.checked = 'checked';
        var label = L.DomUtil.create('label', '', container);
        label.innerHTML = short;
        label.title = long;
        label.setAttribute('for', value);
    },

    onAdd: function(map) {
        this.map = map;

        this._container = L.DomUtil.create('div', 'leaflet-measure-control leaflet-control');

        new L.Measurable(map);

        var toggle = L.DomUtil.create('a', 'leaflet-measure-toggle', this._container);
        toggle.href = '#';
        toggle.title = L._('Measure distances');
        this.addUnit(this._container, 'km', L._('km'), L._('kilometers'), true)
        this.addUnit(this._container, 'mi', L._('mi'), L._('miles'))
        this.addUnit(this._container, 'nm', L._('NM'), L._('nautical miles'))
        L.DomEvent.disableClickPropagation(this._container);

        L.DomEvent
            .addListener(toggle, 'click', L.DomEvent.stop)
            .addListener(toggle, 'click', this.map.measureTools.toggle, this.map.measureTools);

        return this._container;
    }

});


L._ = L._ || function (s, data) {  // Fallback if L.I18n is not used.
    return L.Util.template(s, data);
}
