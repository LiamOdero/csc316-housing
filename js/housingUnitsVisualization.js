function initCityMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.warn('Map container not found');
        return;
    }

    mapContainer.innerHTML = ''; // clear any existing content

    // margin, width, and height might need to be adjusted
    const mapMargin = { top: 50, bottom: 50, right: 20, left: 20 };
    const width = 900;
    const height = 600;
    const innerWidth = width - mapMargin.left - mapMargin.right;
    const innerHeight = height - mapMargin.top - mapMargin.bottom;

    const svg = d3.select(mapContainer)
        .append('svg')
        .attr('width', '100%')
        .attr('height', height)
        .attr('viewBox', '0 0 ' + width + ' ' + height) // internal coordinate system for the SVG - allows for shapes inside it to scale proportionally with it
        .attr('preserveAspectRatio', 'xMidYMid meet'); // map stays centered

    // group for ALL shapes
    const outer = svg.append('g').attr('class', 'map-margin').attr('transform', `translate(${mapMargin.left}, ${mapMargin.top})`);                 
    const gRoot = outer.append('g').attr('class', 'map-root'); // sub group for the map
    const gCountry = gRoot.append('g').attr('class', 'country-layer'); // countries
    const gProvinces = gRoot.append('g').attr('class', 'province-layer'); // provinces
    const gCities = gRoot.append('g').attr('class', 'city-layer'); // cities

    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'map-tooltip')
        .style('position', 'fixed')
        .style('pointer-events', 'none')
        .style('background', '#ffffff')
        .style('border', '1px solid #ccc')
        .style('border-radius', '10px')
        .style('padding', '6px 10px')
        .style('font-size', '12px')
        .style('box-shadow', '0 2px 6px rgba(0,0,0,0.1)')
        .style('display', 'none')
        .style('opacity', 0)
        .style('z-index', '10000')
        .style('white-space', 'nowrap')
        .style('transition', 'opacity 0.2s');

    // Add zoom controls container
    const controlsContainer = d3.select(mapContainer)
        .append('div')
        .attr('class', 'map-controls')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('left', '10px')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '10px')
        .style('z-index', '1000');

    // Zoom controls group
    const zoomGroup = controlsContainer.append('div')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '5px');

    const zoomInBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn visualization4btn')
        .text('+');

    const zoomOutBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn visualization4btn')
        .text('−');

    const resetBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn visualization4btn reset')
        .text('Reset');

    // deselect province
    const deselectBtn = controlsContainer.append('button')
        .attr('class', 'visualization4btn deselect-btn')
        .style('display', 'none')
        .text('Deselect Province');
    
    // coordinates to draw canada
    const PROVINCES_URL = 'https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/canada.geojson';

    // load data
    Promise.all([
        d3.json(PROVINCES_URL),
        d3.csv('data/canadacities_clean.csv')
    ]).then(function(results) {
        const provincesGeo = results[0];
        const rows = results[1];

        const projection = d3.geoMercator().fitSize([innerWidth, innerHeight], provincesGeo); // converts longtitude, latitude to x,y 
        const path = d3.geoPath().projection(projection); // path creator on the svg when given a geojson

        // filter city data
        const cities = rows.map(function(r) {
            return {
                city: r.city || 'Unknown city',
                province: r.province || '',
                id: r.id || '',
                population: r.population && !isNaN(+r.population) ? +r.population : null,
                lat: +r.latitude,
                lon: +r.longitude
            };
            })
            .filter(function(d) { 
                return Number.isFinite(d.lat) && Number.isFinite(d.lon); 
            });

        let selectedProvince = null;
        const provinceTransition = 350; // time for color transition between selected provinces
        const cityTransition = 300; // ms for city fade transitions

        const provinceElements = gProvinces.selectAll('path.province')
            .data(provincesGeo.features) // each feature in the geojson is a province
            .join('path')
            .attr('class', 'province')
            .attr('d', path) // projects the instructions to draw a province into the SVG space
            .attr('fill', '#ffffffff')
            .attr('stroke', '#333')
            .attr('stroke-width', 0.5)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .style('shape-rendering', 'geometricPrecision')
            .style('cursor', 'pointer');

        // click interaction w/ provinces
        provinceElements.on('click', function(event, d) {
            const provinceName = d.properties.name;
            
            // Only allow selecting a province, not deselecting
            if (selectedProvince === provinceName) {
                // Already selected, do nothing (user should use deselect button)
                return;
            }
            
            // select this province
            selectedProvince = provinceName;
            
            // highlight the province
            provinceElements.transition().duration(provinceTransition).attr('fill', function(p) {
                return p.properties.name === provinceName ? '#9f9e9eff' : '#ffffffff';
            });
            
            // get the bounds of the selected province so that we can zoom into it when clicking
            const bounds = path.bounds(d);
            const dx = bounds[1][0] - bounds[0][0];
            const dy = bounds[1][1] - bounds[0][1];
            const x = (bounds[0][0] + bounds[1][0]) / 2;
            const y = (bounds[0][1] + bounds[1][1]) / 2;
            const scale = Math.min(20, 0.9 / Math.max(dx / innerWidth, dy / innerHeight));
            const translate = [innerWidth / 2 - scale * x, innerHeight / 2 - scale * y];
            
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
            );
            
            // radius of the city circles is proportional to how much zoomed in/out we are
            const baseRadius = 4;
            const scaledRadius = baseRadius / scale;
            
            // show cities in the selected province
            cityCircles.filter(function(city) { return city.province === provinceName; })
                .style('display', 'block')
                .transition().duration(cityTransition)
                .style('opacity', 1)
                .attr('r', scaledRadius);

            // hide cities not in the selected province
            cityCircles.filter(function(city) { return city.province !== provinceName; })
                .style('display', 'none')
                .style('opacity', 0)
                .attr('r', 0);
                
            // show "deselect province" button
            deselectBtn.style('display', 'block');
        });

        provinceElements.on('mouseenter', function(event, d) {
            if (selectedProvince !== d.properties.name) {
                d3.select(this).transition().duration(180).attr('fill', '#c2d6e4ff'); // light blue upon hovering, might change
            }
        }).on('mouseleave', function(event, d) {
            if (selectedProvince !== d.properties.name) {
                d3.select(this).transition().duration(180).attr('fill', '#ffffffff');
            }
        });

        // show province name in the tooltip
        provinceElements.append('title')
            .text(function(d) { 
                return d.properties.name; 
            });

        
        const cityCircles = gCities.selectAll('circle.city')
            .data(cities)
            .join('circle')
            .attr('class', 'city')
            .attr('cx', function(d) { return projection([d.lon, d.lat])[0]; })
            .attr('cy', function(d) { return projection([d.lon, d.lat])[1]; })
            .attr('r', 4)
            .attr('fill', '#000000ff')
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .style('display', 'none')  
            .style('opacity', 0)
            .on('mouseenter', function(event, d) {
                d3.select(this).attr('fill', '#444');
            })
            .on('mousemove', function(event) {
                const x = event.pageX + 10;
                const y = event.pageY + 10;
                tooltip
                    .style('left', x + 'px')
                    .style('top', y + 'px');
            })
            .on('mouseleave', function(event, d) {
                d3.select(this).attr('fill', '#222');
                tooltip.style('display', 'none').style('opacity', 0);
            });

        const zoom = d3.zoom()
            .scaleExtent([1, 20])
            .translateExtent([[0, 0], [innerWidth, innerHeight]])
            .filter(function(event) {
                // no scrolling or double clicking to zoom into the map - must use the buttons
                return event.type !== 'wheel' && event.type !== 'dblclick';
            })
            .on('zoom', function(event) {
                gRoot.attr('transform', event.transform);

                // circles scale with zooming
                const baseRadius = 4;
                const scaledRadius = baseRadius / event.transform.k;

                cityCircles.each(function() {
                    const circle = d3.select(this);
                    if (circle.style('display') !== 'none' && circle.style('opacity') !== '0') {
                        circle.attr('r', scaledRadius);
                    }
                });
            });

        svg.call(zoom);

        zoomInBtn.on('click', function() {
            svg.transition().duration(300).call(zoom.scaleBy, 1.3);
        });

        zoomOutBtn.on('click', function() {
            svg.transition().duration(300).call(zoom.scaleBy, 0.77);
        });

        resetBtn.on('click', function() {
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        });

        // deselect province
        deselectBtn.on('click', function() {
            selectedProvince = null;
            provinceElements.transition().duration(provinceTransition).attr('fill', '#ffffffff');
            
            // current displayed cities shrink and fade out
            cityCircles.transition().duration(cityTransition)
                .style('opacity', 0)
                .attr('r', 0)
                .on('end', function() { d3.select(this).style('display', 'none'); });
            
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity
            );
            
            deselectBtn.style('display', 'none');
        });
    }).catch(function(err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load map data:', err);
    });
}
