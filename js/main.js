
// Start application by loading the data
loadData();

function loadData() {
    d3.csv("data/star_dataset.csv").then(data => {
        // Placeholder for star dataset processing
    });
}

function prepareData(data){

}

initCityMap();
function initCityMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        return;
    }

    mapContainer.innerHTML = ''; // clear any existing content that might be in the container

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

    const tooltip = d3.select(mapContainer)
        .append('div')
        .attr('class', 'map-tooltip')
        .style('position', 'absolute')
        .style('pointer-events', 'none')
        .style('background', '#ffffff')
        .style('border', '1px solid #ccc')
        .style('border-radius', '10px')
        .style('padding', '6px 10px')
        .style('font-size', '12px')
        .style('box-shadow', '0 2px 6px rgba(0,0,0,0.1)')
        .style('display', 'none')
        .style('z-index', '1000');

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

        // draw the map
        gProvinces.selectAll('path.province')
            .data(provincesGeo.features) // each feature in the geojson is a province
            .join('path')
            .attr('class', 'province')
            .attr('d', path) // projects the instructions to draw a province into the SVG space
            .attr('fill', '#ffffffff')
            .attr('stroke', '#333')
            .attr('stroke-width', 0.5)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .style('shape-rendering', 'geometricPrecision');

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

        
        const cityCircles = gCities.selectAll('circle.city')
            .data(cities)
            .join('circle')
            .attr('class', 'city')
            .attr('cx', function(d) { return projection([d.lon, d.lat])[0]; })
            .attr('cy', function(d) { return projection([d.lon, d.lat])[1]; })
            .attr('r', 4)
            .attr('fill', '#222')
            .attr('stroke', '#000')
            .attr('stroke-width', 0.75)
            .attr('cursor', 'pointer');

        cityCircles.append('title')
            .text(function(d) {
                let text = d.city;
                if (d.province) text += ', ' + d.province;
                if (d.population) text += '\nPopulation: ' + d.population.toLocaleString();
                if (d.id) text += '\nID: ' + d.id;
                return text;
            });

        cityCircles
            .on('mouseenter', function(event, d) {
                d3.select(this).attr('fill', '#444');
                
                let content = '<div style="text-align:left;min-width:180px">';
                content += '<div style="font-weight:600">' + d.city + '</div>';
                if (d.province) content += '<div>' + d.province + '</div>';
                content += '<div>Population: ' + (d.population ? d.population.toLocaleString() : 'N/A') + '</div>';
                if (d.id) content += '<div style="font-size:11px;color:#666">ID: ' + d.id + '</div>';
                content += '</div>';
                
                tooltip.html(content).style('display', 'block');
            })
            .on('mousemove', function(event) {
                const rect = mapContainer.getBoundingClientRect();
                const x = event.clientX - rect.left + 10;
                const y = event.clientY - rect.top + 10;
                tooltip
                    .style('left', x + 'px')
                    .style('top', y + 'px');
            })
            .on('mouseleave', function() {
                d3.select(this).attr('fill', '#222');
                tooltip.style('display', 'none');
            });

        const zoom = d3.zoom()
            .scaleExtent([1, 8])
            .translateExtent([[0, 0], [innerWidth, innerHeight]])
            .on('zoom', function(event) {
                gRoot.attr('transform', event.transform);
            });

        svg.call(zoom);

        // eslint-disable-next-line no-console
        console.info('Plotted ' + cities.length + ' cities on the map (D3 + SVG)');
    }).catch(function(err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load map data:', err);
    });
}