L.Control.Elevation = L.Control.extend({
    options: {
        position: "topright",
        theme: "lime-theme",
        width: 600,
        height: 175,
        margins: {
            top: 10,
            right: 20,
            bottom: 30,
            left: 60
        },
        useHeightIndicator: true,
        interpolation: "linear",
        elevationZoom: true,
        hoverNumber: {
            decimalsX: 3,
            decimalsY: 0,
            formatter: undefined
        },
        xTicks: undefined,
        yTicks: undefined,
        collapsed: false,
        yAxisMin: undefined,
        yAxisMax: undefined,
        forceAxisBounds: false,
        controlButton: {
            iconCssClass: "elevation-toggle-icon",
            title: "Elevation"
        },
        imperial: false
    },
    __mileFactor: 0.621371,
    __footFactor: 3.28084,

    onRemove: function (map) {
        this._container = null;
    },

    onAdd: function (map) {
        this._map = map;

        var opts = this.options;
        var margin = opts.margins;
        opts.xTicks = opts.xTicks || Math.round(this._width() / 75);
        opts.yTicks = opts.yTicks || Math.round(this._height() / 30);
        opts.hoverNumber.formatter = opts.hoverNumber.formatter || this._formatter;

        var x = this._x = d3.scale.linear()
            .range([0, this._width()]);

        var y = this._y = d3.scale.linear()
            .range([this._height(), 0]);

        var area = this._area = d3.svg.area()
            .interpolate(opts.interpolation)
            .x(function (d) {
                var xDiagCoord = x(d.dist);
                d.xDiagCoord = xDiagCoord;
                return xDiagCoord;
            })
            .y0(this._height())
            .y1(function (d) {
                return y(d.altitude);
            });

        var container = this._container = L.DomUtil.create("div", "elevation");
        L.DomUtil.addClass(container, opts.theme); //append theme to control

        this._initToggle();

        var cont = d3.select(container);
        container.style.width = opts.width + 'px';
        container.style.height = opts.height + 'px';
        cont.attr("width", opts.width);

        var svg = this._svg = cont.append("svg");
        svg.attr("width", opts.width)
            .attr("class", "background")
            .attr("height", opts.height)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var line = d3.svg.line();
        console.dir(line);
        line = line
            .x(function (d) {
                return d3.mouse(svg.select("g"))[0];
            })
            .y(function (d) {
                return this._height();
            });

        var g = d3.select(this._container).select("svg").select("g");

        this._areapath = g.append("path")
            .attr("class", "area");

        var background = this._background = g.append("rect")
            .attr("width", this._width())
            .attr("height", this._height())
            .style("fill", "none")
            .style("stroke", "none")
            .style("pointer-events", "all");

        g.append("clipPath").attr("id", "clip")
            .append("rect").attr("width", this._width())
            .attr("height", this._height());


        if (L.Browser.mobile) {

            background.on("touchmove.drag", this._dragHandler.bind(this)).
                on("touchstart.drag", this._dragStartHandler.bind(this)).
                on("touchstart.focus", this._mousemoveHandler.bind(this));
            L.DomEvent.on(this._container, 'touchend', this._dragEndHandler, this);

        } else {

            background.on("mousemove.focus", this._mousemoveHandler.bind(this)).
                on("mouseout.focus", this._mouseoutHandler.bind(this)).
                on("mousedown.drag", this._dragStartHandler.bind(this)).
                on("mousemove.drag", this._dragHandler.bind(this));
            L.DomEvent.on(this._container, 'mouseup', this._dragEndHandler, this);

        }

        this._xaxisgraphicnode = g.append("g");
        this._yaxisgraphicnode = g.append("g");
        this._appendXaxis(this._xaxisgraphicnode);
        this._appendYaxis(this._yaxisgraphicnode);

        var focusG = this._focusG = g.append("g");
        this._mousefocus = focusG.append('svg:line')
            .attr('class', 'mouse-focus-line')
            .attr('x2', '0')
            .attr('y2', '0')
            .attr('x1', '0')
            .attr('y1', '0');
        this._focuslabelX = focusG.append("svg:text")
            .style("pointer-events", "none")
            .attr("class", "mouse-focus-label-x");
        this._focuslabelY = focusG.append("svg:text")
            .style("pointer-events", "none")
            .attr("class", "mouse-focus-label-y");

        this._tooltips = cont.append("div")
            .attr("class", "tooltips")
            .style("opacity", 0);

        if (this._data) {
            this._applyData();
        }

        return container;
    },

    _dragHandler: function () {

        //we dont want map events to occur here
        d3.event.preventDefault();
        d3.event.stopPropagation();

        this._gotDragged = true;

        this._drawDragRectangle();

    },

    /*
     * Draws the currently dragged rectabgle over the chart.
     */
    _drawDragRectangle: function () {

        if (!this._dragStartCoords) {
            return;
        }

        var dragEndCoords = this._dragCurrentCoords = d3.mouse(this._background.node());

        var x1 = Math.min(this._dragStartCoords[0], dragEndCoords[0]),
            x2 = Math.max(this._dragStartCoords[0], dragEndCoords[0]);

        if (!this._dragRectangle && !this._dragRectangleG) {
            var g = d3.select(this._container).select("svg").select("g");

            this._dragRectangleG = g.append("g");

            this._dragRectangle = this._dragRectangleG.append("rect")
                .attr("width", x2 - x1)
                .attr("height", this._height())
                .attr("x", x1)
                .attr('class', 'mouse-drag')
                .style("pointer-events", "none");
        } else {
            this._dragRectangle.attr("width", x2 - x1)
                .attr("x", x1);
        }

    },

    /*
     * Removes the drag rectangle and zoms back to the total extent of the data.
     */
    _resetDrag: function () {

        if (this._dragRectangleG) {

            this._dragRectangleG.remove();
            this._dragRectangleG = null;
            this._dragRectangle = null;

            this._hidePositionMarker();
        }
        this._map.fitBounds(this._fullExtent);
        this._zoom(0, this._data.length - 1);
    },

    /*
     * Handles end of dragg operations. Zooms the map to the selected items extent.
     */
    _dragEndHandler: function () {

        if (!this._dragStartCoords || !this._gotDragged) {
            this._dragStartCoords = null;
            this._gotDragged = false;
            this._resetDrag();
            return;
        }

        this._hidePositionMarker();

        var item1 = this._findItemForX(this._dragStartCoords[0]),
            item2 = this._findItemForX(this._dragCurrentCoords[0]);
        if (item1 == item2) {
            this._resetDrag();
            return;
        }

        this._fitSection(item1, item2);
        this._zoom(item1, item2);

        this._dragStartCoords = null;
        this._gotDragged = false;

        if (this._dragRectangleG) {
            this._dragRectangleG.remove();
            this._dragRectangleG = null;
            this._dragRectangle = null;
        }
    },

    _dragStartHandler: function () {

        d3.event.preventDefault();
        d3.event.stopPropagation();

        this._gotDragged = false;

        this._dragStartCoords = d3.mouse(this._background.node());

    },

    /*
     * Finds a data entry for a given x-coordinate of the diagram
     */
    _findItemForX: function (x) {
        var bisect = d3.bisector(function (d) {
            return d.dist;
        }).left;
        var xinvert = this._x.invert(x);
        return bisect(this._data, xinvert);
    },

    /*
     * Finds an item with the smallest delta in distance to the given latlng coords
     */
    _findItemForLatLng: function (latlng) {
        var result = null,
            d = Infinity;
        this._data.forEach(function (item) {
            var dist = latlng.distanceTo(item.latlng);
            if (dist < d) {
                d = dist;
                result = item;
            }
        });
        return result;
    },

    /** Make the map fit the route section between given indexes. */
    _fitSection: function (index1, index2) {

        var start = Math.min(index1, index2),
            end = Math.max(index1, index2);

        var ext = this._calculateFullExtent(this._data.slice(start, end));

        this._map.fitBounds(ext);

    },

    _initToggle: function () {

        /* inspired by L.Control.Layers */

        var container = this._container;

        //Makes this work on IE10 Touch devices by stopping it from firing a mouseout event when the touch is released
        container.setAttribute('aria-haspopup', true);

        if (!L.Browser.mobile) {
            L.DomEvent
                .disableClickPropagation(container);
            //.disableScrollPropagation(container);
        } else {
            L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation);
        }

        if (this.options.collapsed) {
            this._collapse();

            if (!L.Browser.android) {
                L.DomEvent
                    .on(container, 'mouseover', this._expand, this)
                    .on(container, 'mouseout', this._collapse, this);
            }
            var link = this._button = L.DomUtil.create('a', "elevation-toggle " + this.options.controlButton
                .iconCssClass, container);
            link.href = '#';
            link.title = this.options.controlButton.title;

            if (L.Browser.mobile) {
                L.DomEvent
                    .on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', this._expand, this);
            } else {
                L.DomEvent.on(link, 'focus', this._expand, this);
            }

            this._map.on('click', this._collapse, this);
            // TODO keyboard accessibility
        }
    },

    _expand: function () {
        this._container.className = this._container.className.replace(' elevation-collapsed', '');
    },

    _collapse: function () {
        L.DomUtil.addClass(this._container, 'elevation-collapsed');
    },

    _width: function () {
        var opts = this.options;
        return opts.width - opts.margins.left - opts.margins.right;
    },

    _height: function () {
        var opts = this.options;
        return opts.height - opts.margins.top - opts.margins.bottom;
    },
    /*
     * Zooms (in or out) the elevation graph
     * for the given x item indexes
     * (with awesome svg path animation)
     *
     * @param i - this._data index of the beggining of zoom
     * @param j - this._data index of the end of zoom
     */
    _zoom: function (i, j) {
        if (!this.options.elevationZoom) {
            return;
        }
        if (i > j) {
            var tmp = j;
            j = i;
            i = tmp;
        }
        var xdomain = d3.extent(this._data.slice(i, j), function (d) {
            return d.dist;
        });
        this._x.domain(xdomain);
        var t = this._svg.transition().duration(750);
        t.select(".x.axis").call(this._x_axis);
        t.select(".area").attr("d", this._area);
    },

    /*
     * Fromatting funciton using the given decimals and seperator
     */
    _formatter: function (num, dec, sep) {
        var res;
        if (dec === 0) {
            res = Math.round(num) + "";
        } else {
            res = L.Util.formatNum(num, dec) + "";
        }
        var numbers = res.split(".");
        if (numbers[1]) {
            var d = dec - numbers[1].length;
            for (; d > 0; d--) {
                numbers[1] += "0";
            }
            res = numbers.join(sep || ".");
        }
        return res;
    },

    _appendYaxis: function (y) {
        var opts = this.options;
        var labelPosition = opts.isInnerLabel === true ? 'right' : 'left';

        if (opts.imperial) {
            y.attr("class", "y axis")
                .call(d3.svg.axis()
                    .scale(this._y)
                    .ticks(this.options.yTicks)
                    .orient(labelPosition))
                .append("text")
                .attr("x", -37)
                .attr("y", 3)
                .style("text-anchor", "end")
                .text("ft");
        } else {
            y.attr("class", "y axis")
                .call(d3.svg.axis()
                    .scale(this._y)
                    .ticks(this.options.yTicks)
                    .orient(labelPosition))
                .append("text")
                .attr("x", -45)
                .attr("y", 3)
                .style("text-anchor", "end")
                .text("m");
        }
    },

    _appendXaxis: function (x) {
        var opts = this.options;
        var labelPosition = opts.isInnerLabel === true ? 'top' : 'bottom';
        this._x_axis = d3.svg.axis()
            .scale(this._x)
            .ticks(this.options.xTicks)
            .orient(labelPosition);

        if (opts.imperial) {
            x.attr("class", "x axis")
                .attr("transform", "translate(0," + this._height() + ")")
                .call(this._x_axis)
                .append("text")
                .attr("x", this._width() + 10)
                .attr("y", 15)
                .style("text-anchor", "end")
                .text("mi");
        } else {
            x.attr("class", "x axis")
                .attr("transform", "translate(0," + this._height() + ")")
                .call(d3.svg.axis()
                    .scale(this._x)
                    .ticks(this.options.xTicks)
                    .orient(labelPosition))
                .append("text")
                .attr("x", this._width() + 20)
                .attr("y", 15)
                .style("text-anchor", "end")
                .text("km");
        }
    },

    _updateAxis: function () {
        this._xaxisgraphicnode.selectAll("g").remove();
        this._xaxisgraphicnode.selectAll("path").remove();
        this._xaxisgraphicnode.selectAll("text").remove();
        this._yaxisgraphicnode.selectAll("g").remove();
        this._yaxisgraphicnode.selectAll("path").remove();
        this._yaxisgraphicnode.selectAll("text").remove();
        this._appendXaxis(this._xaxisgraphicnode);
        this._appendYaxis(this._yaxisgraphicnode);
    },

    _mouseoutHandler: function () {

        this._hidePositionMarker();
        this._hideTooltips();
    },

    /*
     * Hides the position-/heigth indication marker drawn onto the map
     */
    _hidePositionMarker: function () {

        if (this._marker) {
            this._map.removeLayer(this._marker);
            this._marker = null;
        }
        if (this._mouseHeightFocus) {
            this._mouseHeightFocus.style("visibility", "hidden");
            this._mouseHeightFocusLabel.style("visibility", "hidden");
        }
        if (this._pointG) {
            this._pointG.style("visibility", "hidden");
        }
        this._focusG.style("visibility", "hidden");

    },
    _hideTooltips: function () {
        if (this._tooltips) {
            this._tooltips.style("visibility", "hidden");
        }
    },

    /*
     * Handles the moueseover the chart and displays distance and altitude level
     */
    _mousemoveHandler: function (d, i, ctx) {
        if (!this._data || this._data.length === 0) {
            return;
        }
        var coords = d3.mouse(this._background.node());
        var opts = this.options;

        var item = this._data[this._findItemForX(coords[0])],
            alt = item.altitude,
            dist = item.dist,
            ll = item.latlng,
            numY = opts.hoverNumber.formatter(alt, opts.hoverNumber.decimalsY),
            numX = opts.hoverNumber.formatter(dist, opts.hoverNumber.decimalsX);

        if (opts.tooltips) {
            this._showTooltips(item, coords[0]);
        } else {
            this._showDiagramIndicator(item, coords[0]);
        }

        var layerpoint = this._map.latLngToLayerPoint(ll);

        //if we use a height indicator we create one with SVG
        //otherwise we show a marker
        if (opts.useHeightIndicator) {

            if (!this._mouseHeightFocus) {

                var heightG = d3.select(".leaflet-overlay-pane svg")
                    .append("g");
                this._mouseHeightFocus = heightG.append('svg:line')
                    .attr("class", opts.theme + " height-focus line")
                    .attr("x2", 0)
                    .attr("y2", 0)
                    .attr("x1", 0)
                    .attr("y1", 0);

                var pointG = this._pointG = heightG.append("g");
                pointG.append("svg:circle")
                    .attr("r", 6)
                    .attr("cx", 0)
                    .attr("cy", 0)
                    .attr("class", opts.theme + " height-focus circle-lower");

                this._mouseHeightFocusLabel = heightG.append("svg:text")
                    .attr("class", opts.theme + " height-focus-label")
                    .style("pointer-events", "none");

            }

            var normalizedAlt = this._height() / this._maxElevation * alt;
            var normalizedY = layerpoint.y - normalizedAlt;
            this._mouseHeightFocus.attr("x1", layerpoint.x)
                .attr("x2", layerpoint.x)
                .attr("y1", layerpoint.y)
                .attr("y2", normalizedY)
                .style("visibility", "visible");

            this._pointG.attr("transform", "translate(" + layerpoint.x + "," + layerpoint.y + ")")
                .style("visibility", "visible");

            if (opts.imperial) {
                this._mouseHeightFocusLabel.attr("x", layerpoint.x)
                    .attr("y", normalizedY)
                    .text(numY + " ft")
                    .style("visibility", "visible");
            } else {
                this._mouseHeightFocusLabel.attr("x", layerpoint.x)
                    .attr("y", normalizedY)
                    .text(numY + " m")
                    .style("visibility", "visible");
            }

        } else {

            if (!this._marker) {

                this._marker = new L.Marker(ll).addTo(this._map);

            } else {

                this._marker.setLatLng(ll);

            }

        }

    },

    /*
     * Parsing of GeoJSON data lines and their elevation in z-coordinate
     */
    _addGeoJSONData: function (coords) {
        var opts = this.options;
        if (coords) {
            var data = this._data || [];
            var dist = this._dist || 0;
            var ele = this._maxElevation || 0;
            for (var i = 0; i < coords.length; i++) {
                var s = new L.LatLng(coords[i][1], coords[i][0]);
                var e = new L.LatLng(coords[i ? i - 1 : 0][1], coords[i ? i - 1 : 0][0]);
                var newdist = opts.imperial ? s.distanceTo(e) * this.__mileFactor : s.distanceTo(e);
                dist = dist + Math.round(newdist / 1000 * 100000) / 100000;
                ele = ele < coords[i][2] ? coords[i][2] : ele;
                data.push({
                    index: i,
                    dist: dist,
                    altitude: opts.imperial ? coords[i][2] * this.__footFactor : coords[i][2],
                    x: coords[i][0],
                    y: coords[i][1],
                    latlng: s
                });
            }
            this._dist = dist;
            this._data = data;
            ele = opts.imperial ? ele * this.__footFactor : ele;
            this._maxElevation = ele;
        }
    },

    /*
     * Parsing function for GPX data as used by https://github.com/mpetazzoni/leaflet-gpx
     */
    _addGPXdata: function (coords) {
        var opts = this.options;
        if (coords) {
            var data = this._data || [];
            var dist = this._dist || 0;
            var ele = this._maxElevation || 0;
            for (var i = 0; i < coords.length; i++) {
                var s = coords[i];
                var e = coords[i ? i - 1 : 0];
                var newdist = opts.imperial ? s.distanceTo(e) * this.__mileFactor : s.distanceTo(e);
                dist = dist + Math.round(newdist / 1000 * 100000) / 100000;
                ele = ele < s.meta.ele ? s.meta.ele : ele;
                data.push({
                    index: i,
                    dist: dist,
                    altitude: opts.imperial ? s.meta.ele * this.__footFactor : s.meta.ele,
                    x: s.lng,
                    y: s.lat,
                    latlng: s
                });
            }
            this._dist = dist;
            this._data = data;
            ele = opts.imperial ? ele * this.__footFactor : ele;
            this._maxElevation = ele;
        }
    },

    _addData: function (d) {
        var geom = d && d.geometry && d.geometry;
        var i;

        if (geom) {
            switch (geom.type) {
                case 'LineString':
                    this._addGeoJSONData(geom.coordinates);
                    break;

                case 'MultiLineString':
                    for (i = 0; i < geom.coordinates.length; i++) {
                        this._addGeoJSONData(geom.coordinates[i]);
                    }
                    break;
                case 'Point':
                    // TODO: adding plot func
                    console.log("Geometry of type Point found in GeoJSON, ignoring it for elevation plot.");
                    break;

                default:
                    throw new Error('Invalid GeoJSON object.');
            }
        }

        var feat = d && d.type === "FeatureCollection";
        if (feat) {
            for (i = 0; i < d.features.length; i++) {
                this._addData(d.features[i]);
            }
        }

        if (d && d._latlngs) {
            this._addGPXdata(d._latlngs);
        }
    },

    /*
     * Calculates the full extent of the data array
     */
    _calculateFullExtent: function (data) {

        if (!data || data.length < 1) {
            throw new Error("no data in parameters");
        }

        var ext = new L.latLngBounds(data[0].latlng, data[0].latlng);

        data.forEach(function (item) {
            ext.extend(item.latlng);
        });

        return ext;

    },

    /*
     * Add data to the diagram either from GPX or GeoJSON and
     * update the axis domain and data
     */
    addData: function (d, layer) {
        this._addData(d);
        if (this._container) {
            this._applyData();
        }
        if (layer === null && d.on) {
            layer = d;
        }
        if (layer) {
            layer.on("mousemove", this._handleLayerMouseOver.bind(this));
        }
    },

    /*
     * Handles mouseover events of the data layers on the map.
     */
    _handleLayerMouseOver: function (evt) {
        var opts = this.options;
        if (!this._data || this._data.length === 0) {
            return;
        }
        var latlng = evt.latlng;
        var item = this._findItemForLatLng(latlng);
        if (item) {
            var x = item.xDiagCoord;
            if (opts.tooltips) {
                this._showTooltips(item, x);
            } else {
                this._showDiagramIndicator(item, x);
            }
        }
    },

    _showTooltips: function (item, xCoordinate) {
        var opts = this.options;

        this._focusG.style("visibility", "visible");
        this._mousefocus.attr('x1', xCoordinate)
            .attr('y1', 0)
            .attr('x2', xCoordinate)
            .attr('y2', this._height())
            .classed('hidden', false);

        var tipsWidth = this._tooltips.style('width').slice(0, -2) * 1;
        var tooltipsPos = xCoordinate + 20;
        var tooltipsAlign = 'left';
        if (this._width() / 2 < xCoordinate) {
            tooltipsPos = xCoordinate - (tipsWidth + 20);
            tooltipsAlign = 'right';
        }

        this._tooltips.style("text-align", tooltipsAlign).style("opacity", 1).style("left", tooltipsPos + 'px');
        this._tooltips.html(
            "<p>" +
            opts.tooltipsLabel.dist + " : " + Math.round(item.dist * 100) / 100 + "km<br/>" +
            opts.tooltipsLabel.elevation + " : " + item.altitude + "m<br/>" +
            opts.tooltipsLabel.slope + " : " + Math.round(item.slope * 100) / 10 + "%<br/>" +
            "</p>");
        /*
                    + "罔 : " + item.altitude + "m<br/>"
                    + "距離差 : " + item.altitude + "<br/>標高差<br/>平均斜度</p>");
                    */
        this._tooltips.style("visibility", "visible");
    },


    _showDiagramIndicator: function (item, xCoordinate) {
        var opts = this.options;
        this._focusG.style("visibility", "visible");
        this._mousefocus.attr('x1', xCoordinate)
            .attr('y1', 0)
            .attr('x2', xCoordinate)
            .attr('y2', this._height())
            .classed('hidden', false);

        var alt = item.altitude,
            dist = item.dist,
            ll = item.latlng,
            numY = opts.hoverNumber.formatter(alt, opts.hoverNumber.decimalsY),
            numX = opts.hoverNumber.formatter(dist, opts.hoverNumber.decimalsX);

        if (opts.imperial) {
            this._focuslabelX.attr("x", xCoordinate)
                .text(numY + " ft");
            this._focuslabelY.attr("y", this._height() - 5)
                .attr("x", xCoordinate)
                .text(numX + " mi");
        } else {
            this._focuslabelX.attr("x", xCoordinate)
                .text(numY + " m");
            this._focuslabelY.attr("y", this._height() - 5)
                .attr("x", xCoordinate)
                .text(numX + " km");
        }
    },

    _applyData: function () {
        var xdomain = d3.extent(this._data, function (d) {
            return d.dist;
        });
        var ydomain = d3.extent(this._data, function (d) {
            return d.altitude;
        });
        var opts = this.options;

        if (opts.yAxisMin !== undefined && (opts.yAxisMin < ydomain[0] || opts.forceAxisBounds)) {
            ydomain[0] = opts.yAxisMin;
        }
        if (opts.yAxisMax !== undefined && (opts.yAxisMax > ydomain[1] || opts.forceAxisBounds)) {
            ydomain[1] = opts.yAxisMax;
        }

        this._x.domain(xdomain);
        this._y.domain(ydomain);
        this._areapath.datum(this._data)
            .attr("d", this._area)
            .attr("clip-path", "url(#clip)");
        this._updateAxis();

        this._fullExtent = this._calculateFullExtent(this._data);

        if (opts.addSlope) {
            var _elevBuffer = 0;
            var _distBuffer = 0;

            for (var i = 0, len = this._data.length; i < len; i++) {
                if (i === 0) {
                    _distBuffer = this._data[i].dist;
                    _elevBuffer = this._data[i].altitude;
                    this._data[i].slope = 0;
                    continue;
                }
                var distDiff = parseFloat(this._data[i].dist - _distBuffer);
                var elevDiff = parseFloat(this._data[i].altitude - _elevBuffer);

                if (elevDiff === 0) {
                    this._data[i].slope = 0;
                }
                this._data[i].slope = elevDiff / distDiff / 100;
                // this._data[i].slope = Math.atan(elevDiff / distDiff) * 180 / 3.141592653589793;
                _elevBuffer = this._data[i].altitude;
                _distBuffer = this._data[i].dist;
            }
        }
    },

    /*
     * Reset data
     */
    _clearData: function () {
        this._data = null;
        this._dist = null;
        this._maxElevation = null;
    },

    /*
     * Reset data and display
     */
    clear: function () {

        this._clearData();

        if (!this._areapath) {
            return;
        }

        // workaround for 'Error: Problem parsing d=""' in Webkit when empty data
        // https://groups.google.com/d/msg/d3-js/7rFxpXKXFhI/HzIO_NPeDuMJ
        //this._areapath.datum(this._data).attr("d", this._area);
        this._areapath.attr("d", "M0 0");

        this._x.domain([0, 1]);
        this._y.domain([0, 1]);
        this._updateAxis();
    },
    hide: function () {
        this._container.style.display = "none";
    },
    show: function () {
        this._container.style.display = "block";
    }

});

L.control.elevation = function (options) {
    return new L.Control.Elevation(options);
};
