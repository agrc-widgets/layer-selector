/**
 * A module representing a layer-selector.
 * @param {_WidgetBase} _WidgetBase - The base class for all widgets.
 * @param {_TemplatedMixin} _TemplatedMixin - Mixin for widgets that are instantiated from a template.
 * @module layer-selector/layer-selector
*/
define([
    'dijit/_TemplatedMixin',
    'dijit/_WidgetBase',

    'dojo/dom-class',
    'dojo/dom-construct',
    'dojo/text!./templates/LayerSelector.html',
    'dojo/_base/array',
    'dojo/_base/declare',
    'dojo/_base/lang',

    'esri/layers/WebTiledLayer',

    './LayerSelectorItem'
], function (
    _TemplatedMixin,
    _WidgetBase,

    domClass,
    domConstruct,
    template,
    array,
    declare,
    lang,

    WebTiledLayer,

    LayerSelectorItem
) {
    return declare([_WidgetBase, _TemplatedMixin], {
        /** @property {string} - The class' html `templateString`. */
        templateString: template,
        /** @property {string} - The class' css `baseClass` property. */
        baseClass: 'layer-selector',
        /** @property {string} - HTML fragment. */
        separator: '<hr class="layer-selector-separator" />',
        /** @property {bool} - True if the widget should be in the top of the container. */
        top: true,
        /** @property {bool} - True if the widget should be in the right of the container. */
        right: true,
        /** @property {string} - The four word authentication token acquired from the appliance. */
        quadWord: null,
        /** @property {array} - The layers linked to our default basemaps in the appliance. */
        _applianceLayers: {
            'Imagery': {
                urlPattern: 'https://discover.agrc.utah.gov/login/path/{quad}/tiles/utah/${level}/${col}/${row}'
            },
            'Topo': {
                urlPattern: 'https://discover.agrc.utah.gov/login/path/{quad}/tiles/topo_basemap/${level}/${col}/${row}'
            },
            'Lite': {
                urlPattern: 'https://discover.agrc.utah.gov/login/path/{quad}/tiles/lite_basemap/${level}/${col}/${row}'
            },
            'Color IR': {
                urlPattern: 'https://discover.agrc.utah.gov/login/path/{quad}/tiles/naip_2011_nrg/${level}/${col}/${row}'
            },
            'Hybrid': {
                urlPattern: 'https://discover.agrc.utah.gov/login/path/{quad}/tiles/utah/${level}/${col}/${row}',
                linked: ['Overlay']
            },
            'Overlay': {
                urlPattern: 'https://discover.agrc.utah.gov/login/path/{quad}/tiles/overlay_basemap/${level}/${col}/${row}'
            }
        },
        /** @property {esri/TileInfo} - The default TileInfo description for appliance layers. */
        _defaultTileInfo: null,
        /** @property {bool} - True if any of the baseLayers have a linked property. */
        _hasLinkedLayers: false,

        /** The initilizer for the class.
         * @param {{Object}} - params - The params passed into the constructor.
         */
        constructor: function (params) {
            console.log('layer-selector:constructor', arguments);

            // check for map
            if (!params.map) {
                throw new Error('layer-selector::Missing map in constructor args. `new LayerSelector({map: map});`');
            }

            this._hasLinkedLayers = params.baseLayers && params.baseLayers.some(function checkForLinked(layerInfo) {
                return layerInfo.linked;
            });
        },
        /** Overrides method of same name in dijit._Widget.
         * @param {esri/map|agrc/widgets/map/BaseMap} map - The map to control layer selection.
         * @param {[{factory, url, id, tileInfo}]} baseLayers - mutually exclusive layers (only one can be visible on your map).
         * @param {[{factory, url, id, tileInfo}]} overlays - layers you display over the `baseLayers`.
         */
        postCreate: function () {
            console.log('layer-selector::postCreate', arguments);

            this._setupConnections();
            this._polyfill();

            this.inherited(arguments);

            if (!this.baseLayers || this.baseLayers.length < 1) {
                domClass.add(this.domNode, this.baseClass + '-hidden');
                console.warn('layer-selector::`baseLayers` is null or empty. Make sure you have spelled it correctly ' +
                             'and are passing it into the constructor of this widget.');
                return;
            }

            var locations = {
                top: this.top,
                right: this.right
            };

            this._placeWidget(locations, this.domNode, this.map.root, this.baseClass);

            this._buildUi(this.baseLayers || [], this.overlays || []);
        },
        /** wire events, and such */
        _setupConnections: function () {
            console.log('layer-selector::_setupConnections', arguments);

        },
        /** Takes the `baseLayers` and `overlays` and creates the UI markup.
         * @param {[esri/layers/layer]} baseLayers - mutually exclusive layers (only one can be visible on your map).
         * @param {[esri/layers/layer]} overlays - layers you display over the `baseLayers`.
         */
        _buildUi: function (baseLayers, overlays) {
            console.log('layer-selector:_buildUi', arguments);

            baseLayers = this._resolveBasemapTokens(baseLayers, this.quadWord);
            overlays = this._resolveBasemapTokens(overlays, this.quadWord);

            this.baseLayerWidgets = this._buildLayerItemWidgets(baseLayers, this.layerContainer, 'radio');
            this.overlayWidgets = this._buildLayerItemWidgets(overlays, this.layerContainer, 'checkbox');

            if (this.baseLayerWidgets.length === 1) {
                this.baseLayerWidgets[0].set('hidden', true);
            }

            var visibleBaseLayers = array.filter(this.baseLayerWidgets, function findVisible(layer) {
                return !layer.get('hidden');
            });

            if (visibleBaseLayers.length === 0 && this.overlayWidgets.length === 0) {
                domClass.add(this.domNode, this.baseClass + '-hidden');
                console.warn('layer-selector::`baseLayers` has no visible layers and `overlays` is null or empty. ' +
                             'This widget will be hidden since it will serve no purpose. Reconsider using it at all.');
                return;
            }

            this._selectLayerElements(overlays, this.overlayWidgets, false);
            this._selectLayerElements(baseLayers, this.baseLayerWidgets, true);

            if (visibleBaseLayers.length > 0 && this.overlayWidgets.length > 0) {
                domConstruct.place(this.separator, this.layerContainer, this.baseLayerWidgets.length);
            }
        },
        /** Places the widget in the map container and in which corner using this.top and this.right.
         * @param {object} locations - contains a  boolean `top` and `right` property for determining
         * which corner to place the widget.
         * @param {domNode} node - the root node of the widget.
         * @param {domNode} refNode - the reference node for placing the widget.
         * @param {string} baseClass - the base css class for suffixing the placement css classes.
         */
        _placeWidget: function (locations, node, refNode, baseClass) {
            console.log('layer-selector:_placeWidget', arguments);

            if (!locations.top) {
                domClass.replace(node, baseClass + '-bottom', baseClass + '-top');
            }

            if (!locations.right) {
                domClass.replace(node, baseClass + '-left', baseClass + '-right');
            }

            domConstruct.place(node, refNode);
        },
        /** Takes layer tokens from `_applianceLayers` keys and resolves them to `esri\WebTiledLayers`.
         * @param {[string|{factory, url, id, tileInfo}]} - layerInfo - An array of layer tokens or layer monads.
         * @returns {[{factory, url, id, tileInfo}]} - an array of resolved layer monads
         */
        _resolveBasemapTokens: function (layerInfos) {
            console.log('layer-selector:_resolveBasemapTokens', arguments);

            var resolvedInfos = [];
            array.forEach(layerInfos, function resolveToken(li) {
                if (typeof li === 'string' || li instanceof String || li.token &&
                   (typeof li.token === 'string' || li.token instanceof String)) {

                    var id = (id || li.token || li);

                    if (!this.quadWord) {
                        console.warn('layer-selector::You chose to use a layer token `' + (id || li.token || li) + '` without setting ' +
                                     'your `quadWord` from the appliance. The requests for tiles will fail to ' +
                                     ' authenticate. Pass `quadWord` in to the constructor of this widget.');
                        return false;
                    }

                    var layer = this._applianceLayers[id];

                    if (!layer) {
                        console.warn('layer-selector::The layer token `' + (id || li.token || li) + '` was not found. Please use ' +
                                     Object.keys(this._applianceLayers).join() + ' or pass in the information on how ' +
                                    'to create your custom layer. `{factory, url, id}``');
                        return false;
                    }

                    resolvedInfos.push({
                        factory: WebTiledLayer,
                        url: layer.urlPattern.replace('{quad}', this.quadWord),
                        id: id,
                        selected: li.selected || null
                    });
                } else {
                    resolvedInfos.push(li);
                }
            }, this);

            return resolvedInfos;
        },
        /** Takes the `baseLayers` or `overlays` and addes them to the `container`.
         * @param {[Object]} - layerInfos - layer infos as passed via `baseLayers` or `overlays`
         * @param {domNode} - container - the dom node to hold the created elements.
         * @param {string} - type - radio or checkbox.
         * @returns {[DomNodes]} - the nodes placed.
         */
        _buildLayerItemWidgets: function (layerInfos, container, type) {
            console.log('layer-selector:_buildLayerItemWidgets', arguments);

            if (!layerInfos || !layerInfos.length) {
                return [];
            }

            var widgets = [];
            layerInfos.forEach(function addToContainer(li) {
                var item = new LayerSelectorItem({
                    layerInfo: li,
                    inputType: type
                }).placeAt(container);

                this.own(
                    item.on('changed', lang.hitch(this, '_updateMap')),
                    item
                );

                widgets.push(item);
            }, this);

            return widgets;
        },
        /** selects the radio box or checkbox for layers.
         * @param {[esri/layers]} - layers - layers to be added to the selector.
         * @param {[layer-selector-item]} - widgets - the html representation of the layer.
         * @param {bool} - firstOnly - only select the first item. Or select them all.
         */
        _selectLayerElements: function (layers, widgets, firstOnly) {
            console.log('layer-selector:_selectLayerElements', arguments);

            if (!layers || !layers.length) {
                return;
            }

            if (firstOnly) {
                var selectedIndex = -1;
                var found = layers.find(function findSelected(layer, i) {
                    selectedIndex = i;
                    return layer.selected;
                }, this);

                if (found) {
                    widgets[selectedIndex].set('selected', true);
                } else {
                    if (widgets.length > 0) {
                        widgets[0].set('selected', true);
                    }
                }

                return;
            }

            array.forEach(layers, function findSelected(layer, i) {
                if (layer.selected) {
                    widgets[i].set('selected', true);
                }
            });
        },
        /** Recieves the old, new, and property from the selected watcher.
         * @param {Object} - layerItem - item that was changed
         * @returns return_type - return_description
         */
        _updateMap: function (layerItem) {
            console.log('layer-selector:_updateMap', arguments);

            var managedLayers = this.get('managedLayers') || {};

            if (layerItem.get('selected') === false) {
                var managedLayer = managedLayers[layerItem.name] || {};
                if (!managedLayer.layer) {
                    managedLayer.layer = this.map.getLayer(layerItem.name);
                }

                if (managedLayer.layer) {
                    this.map.removeLayer(managedLayer.layer);
                }

                return;
            }

            if (Object.keys(managedLayers).indexOf(layerItem.name) < 0) {
                managedLayers[layerItem.name] = {
                    layerType: layerItem.layerType
                };
            }

            this.set('managedLayers', managedLayers);

            if (!managedLayers[layerItem.name].layer) {
                managedLayers[layerItem.name].layer = new layerItem.layerInfo.factory(layerItem.layerInfo.url, layerItem.layerInfo);
            }

            var index = layerItem.layerType === 'baselayer' ? 0 : 1;

            if (layerItem.get('selected') === true) {
                this.map.addLayer(managedLayers[layerItem.name].layer, index);
            } else {
                this.map.removeLayer(managedLayers[layerItem.name].layer);
            }

            if (layerItem.layerType === 'baselayer') {
                this._syncSelectedWithUi(layerItem.name);
            }
        },
        /** Keep the selected button consistent across layer Items.
         * @param {string} - id - The id of the layer added to the map.
         */
        _syncSelectedWithUi: function (id) {
            console.log('layer-selector:_syncSelectedWithUi', arguments);

            // turn off all other base layers
            var baseWidget;
            array.forEach(this.baseLayerWidgets, function updateSelected(item) {
                if (item.name !== id) {
                    item.set('selected', false);
                } else {
                    baseWidget = item;
                }
            });

            // toggle overlays based on linked only if there is a baselayer with a linked property
            if (this._hasLinkedLayers) {
                var linked = baseWidget.layerInfo.linked || [];
                array.forEach(this.overlayWidgets, function updateSelected(item) {
                    item.set('selected', linked.indexOf(item.name) > -1);
                });
            }
        },
        /** polyfill array.find from MDN. */
        _polyfill: function () {
            console.log('layer-selector:_polyfill', arguments);
            if (!Array.prototype.find) {
                /* jshint -W121 */
                Array.prototype.find = function (predicate) {
                    /* jshint +W121 */
                    if (this === null) {
                        throw new TypeError('Array.prototype.find called on null or undefined');
                    }
                    if (typeof predicate !== 'function') {
                        throw new TypeError('predicate must be a function');
                    }
                    var list = Object(this);
                    /* jshint -W016 */
                    var length = list.length >>> 0;
                    /* jshint +W016 */
                    var thisArg = arguments[1];
                    var value;

                    for (var i = 0; i < length; i++) {
                        value = list[i];
                        if (predicate.call(thisArg, value, i, list)) {
                            return value;
                        }
                    }
                    return undefined;
                };
            }
        },
        /** Hides and shows the form containing the layer list. */
        _expand: function () {
            console.log('layer-selector:_expand', arguments);

            domClass.remove(this.layerContainer, this.baseClass + '-hidden');
            domClass.add(this.toggler, this.baseClass + '-hidden');
        },
        /** Hides and shows the form containing the layer list. */
        _collapse: function () {
            console.log('layer-selector:_collapse', arguments);

            domClass.add(this.layerContainer, this.baseClass + '-hidden');
            domClass.remove(this.toggler, this.baseClass + '-hidden');
        },
        /** Override startup to call startup on child widgets. */
        startup: function () {
            console.log('layer-selector:startup', arguments);

            var startup = function (child) {
                child.startup();
            };
            array.forEach(this.baseLayerWidgets, startup);
            array.forEach(this.overlayWidgets, startup);

            this.inherited(arguments);
        }
    });
});
