// Flag to track if map has been initialized
let cityMapInitialized = false;

function initCityMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.warn('Map container not found');
        return;
    }
    
    // Prevent re-initialization
    if (cityMapInitialized) {
        console.log('City map already initialized');
        return;
    }

    mapContainer.innerHTML = ''; // clear any existing content
    
    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'map-loading-indicator';
    loadingDiv.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        min-height: 400px;
        flex-direction: column;
        color: #4a5568;
        font-size: 1.2em;
    `;
    loadingDiv.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="
                border: 4px solid #e2e8f0;
                border-top: 4px solid #48bb78;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
            "></div>
        </div>
        <div>Loading rental data...</div>
    `;
    mapContainer.appendChild(loadingDiv);
    
    // Add CSS animation for spinner
    if (!document.getElementById('spinner-animation-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-animation-style';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // State for current selected year, city, and housing type filter
    let currentYear = 2024; // default to most recent year
    let selectedCity = null;
    let selectedHousingType = 'All'; // 'All' or specific housing type
    
    // Placeholder functions that will be replaced after data loads
    let updateCityColors = function() {
        // no-op until data loads
    };
    
    let recalculateRentData = function() {
        // no-op until data loads
    };
    
    let getCityColor = function(cityName) {
        return '#999'; // gray until data loads
    };
    let rentalData = {}; // will store rental data by city
    
    // Shared legend/color state (must be outside Promise.all scope)
    let globalMinRent = Infinity;
    let globalMaxRent = -Infinity;
    let rentColorScale; // initialized in recalculateRentData()
    
    // margin, width, and height might need to be adjusted
    const mapMargin = { top: 50, bottom: 50, right: 20, left: 20 };
    const width = 1200;
    const height = 1000;
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

    // Add timeline and filter container at bottom-right
    const timelineContainer = d3.select(mapContainer)
        .append('div')
        .attr('class', 'timeline-container')
        .style('position', 'absolute')
        .style('bottom', '20px')
        .style('right', '20px')
        .style('background', 'rgba(255, 255, 255, 0.95)')
        .style('padding', '10px 15px')
        .style('border-radius', '8px')
        .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
        .style('z-index', '1000')
        .style('display', 'flex')
        .style('gap', '15px')
        .style('align-items', 'center');

    // Housing type filter section (LEFT side) - Dropdown
    const housingFilterSection = timelineContainer.append('div')
        .style('display', 'flex')
        .style('gap', '8px')
        .style('align-items', 'center')
        .style('padding-right', '15px')
        .style('border-right', '2px solid #e2e8f0');

    housingFilterSection.append('span')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('color', '#2d3748')
        .text('Housing Type:');

    const filterHousingTypes = ['All', 'Bachelor units', 'One bedroom units', 'Two bedroom units', 'Three bedroom units'];
    const filterHousingTypeLabels = {
        'All': 'All Types (Average)',
        'Bachelor units': 'Bachelor',
        'One bedroom units': '1 Bedroom',
        'Two bedroom units': '2 Bedrooms',
        'Three bedroom units': '3 Bedrooms'
    };

    // Create select dropdown
    const housingSelect = housingFilterSection.append('select')
        .attr('class', 'housing-filter-select')
        .style('padding', '6px 12px')
        .style('border', '2px solid #cbd5e0')
        .style('border-radius', '6px')
        .style('background', 'white')
        .style('color', '#2d3748')
        .style('font-size', '13px')
        .style('font-weight', '600')
        .style('cursor', 'pointer')
        .style('outline', 'none')
        .style('transition', 'all 0.2s')
        .on('change', function() {
            selectedHousingType = this.value;
            
            // Recalculate colors and update map
            recalculateRentData();
            updateCityColors();
        })
        .on('focus', function() {
            d3.select(this).style('border-color', '#4a5568');
        })
        .on('blur', function() {
            d3.select(this).style('border-color', '#cbd5e0');
        });

    // Add options to select
    housingSelect.selectAll('option')
        .data(filterHousingTypes)
        .join('option')
        .attr('value', d => d)
        .property('selected', d => d === selectedHousingType)
        .text(d => filterHousingTypeLabels[d]);

    // Year filter section (RIGHT side)
    const yearFilterSection = timelineContainer.append('div')
        .style('display', 'flex')
        .style('gap', '8px')
        .style('align-items', 'center');

    const years = [2020, 2021, 2022, 2023, 2024];
    
    // Add year label
    yearFilterSection.append('span')
        .style('font-size', '14px')
        .style('font-weight', '600')
        .style('color', '#2d3748')
        .style('margin-right', '5px')
        .text('Year:');
    
    // Create year buttons
    const yearButtons = yearFilterSection.selectAll('.year-btn')
        .data(years)
        .join('button')
        .attr('class', 'year-btn')
        .style('padding', '6px 12px')
        .style('border', '2px solid #cbd5e0')
        .style('border-radius', '6px')
        .style('background', d => d === currentYear ? '#4a5568' : 'white')
        .style('color', d => d === currentYear ? 'white' : '#2d3748')
        .style('font-size', '14px')
        .style('font-weight', '600')
        .style('cursor', 'pointer')
        .style('transition', 'all 0.2s')
        .text(d => d)
        .on('click', function(event, year) {
            if (year !== currentYear) {
                currentYear = year;
                
                // Update button styles
                yearButtons
                    .style('background', d => d === currentYear ? '#4a5568' : 'white')
                    .style('color', d => d === currentYear ? 'white' : '#2d3748');
                
                // Update city colors and visibility for new year
                updateCityColors();
                
                // Update line chart if a city is selected
                if (selectedCity) {
                    updateLineChart(selectedCity);
                }
            }
        })
        .on('mouseenter', function(event, year) {
            if (year !== currentYear) {
                d3.select(this)
                    .style('background', '#e2e8f0')
                    .style('border-color', '#a0aec0');
            }
        })
        .on('mouseleave', function(event, year) {
            if (year !== currentYear) {
                d3.select(this)
                    .style('background', 'white')
                    .style('border-color', '#cbd5e0');
            }
        });

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
        .attr('class', 'zoom-btn rentalpricemap-btn')
        .text('+');

    const zoomOutBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn rentalpricemap-btn')
        .text('−');

    const resetBtn = zoomGroup.append('button')
        .attr('class', 'zoom-btn rentalpricemap-btn reset')
        .text('Reset');
    
    // create line chart container (initially hidden - will pop up when a city is clicked)
    const chartContainer = d3.select(mapContainer)
        .append('div')
        .attr('class', 'line-chart-container')
        .style('position', 'absolute')
        .style('right', '20px')
        .style('top', '80px')
        .style('width', '400px')
        .style('background', 'rgba(255, 255, 255, 0.98)')
        .style('border-radius', '10px')
        .style('box-shadow', '0 4px 16px rgba(0,0,0,0.2)')
        .style('padding', '20px')
        .style('display', 'none')
        .style('z-index', '999');
    
    // line chart close button
    const closeChartBtn = chartContainer.append('button')
        .style('position', 'absolute')
        .style('right', '10px')
        .style('top', '10px')
        .style('background', '#8c8c8cff')
        .style('color', 'white')
        .style('border', 'none')
        .style('border-radius', '50%')
        .style('width', '28px')
        .style('height', '28px')
        .style('cursor', 'pointer')
        .style('font-size', '18px')
        .style('line-height', '1')
        .text('×')
        .on('click', function() {
            chartContainer.style('display', 'none');
            selectedCity = null;
            
            // Reset all city colors to their normal state
            gCities.selectAll('circle.city')
                .transition()
                .duration(200)
                .attr('fill', d => getCityColor(d.city));
        });
    
    // Chart title
    const chartTitle = chartContainer.append('div')
        .attr('class', 'chart-title')
        .style('font-size', '16px')
        .style('font-weight', '600')
        .style('color', '#2d3748')
        .style('margin-bottom', '15px');
    
    // Housing type toggles
    const togglesContainer = chartContainer.append('div')
        .attr('class', 'housing-toggles')
        .style('display', 'flex')
        .style('flex-wrap', 'wrap')
        .style('gap', '8px')
        .style('margin-bottom', '15px');
    
    const housingTypes = ['Bachelor units', 'One bedroom units', 'Two bedroom units', 'Three bedroom units'];
    const housingTypeColors = {
        'Bachelor units': '#8b5cf6',
        'One bedroom units': '#3b82f6',
        'Two bedroom units': '#10b981',
        'Three bedroom units': '#f59e0b'
    };
    
    let visibleHousingTypes = new Set(housingTypes); // all visible by default
    
    const housingToggles = togglesContainer.selectAll('button')
        .data(housingTypes)
        .join('button')
        .attr('class', 'housing-toggle')
        .style('padding', '6px 12px')
        .style('border', d => `2px solid ${housingTypeColors[d]}`)
        .style('border-radius', '5px')
        .style('background', d => housingTypeColors[d])
        .style('color', '#fff')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('cursor', 'pointer')
        .style('opacity', '1')
        .style('transition', 'opacity 0.2s')
        .text(d => d.replace(' units', ''))
        .on('click', function(event, d) {
            if (visibleHousingTypes.has(d)) {
                visibleHousingTypes.delete(d);
                d3.select(this).style('opacity', '0.3');
            } else {
                visibleHousingTypes.add(d);
                d3.select(this).style('opacity', '1');
            }
            updateLineChart(selectedCity);
        });
    
    // SVG for line chart
    const chartSvg = chartContainer.append('svg')
        .attr('width', 360)
        .attr('height', 250);
    
    const chartMargin = { top: 10, right: 30, bottom: 30, left: 50 };
    const chartWidth = 360 - chartMargin.left - chartMargin.right;
    const chartHeight = 250 - chartMargin.top - chartMargin.bottom;
    
    const chartG = chartSvg.append('g')
        .attr('transform', `translate(${chartMargin.left},${chartMargin.top})`);
    
    // Create tooltip for chart data points
    const chartTooltip = d3.select('body')
        .append('div')
        .attr('class', 'chart-tooltip')
        .style('position', 'fixed')
        .style('pointer-events', 'none')
        .style('background', 'rgba(0, 0, 0, 0.85)')
        .style('color', '#fff')
        .style('border-radius', '6px')
        .style('padding', '8px 12px')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('box-shadow', '0 2px 8px rgba(0,0,0,0.2)')
        .style('display', 'none')
        .style('opacity', 0)
        .style('z-index', '10001')
        .style('white-space', 'nowrap')
        .style('transition', 'opacity 0.2s');
    
    // coordinates to draw canada
    const PROVINCES_URL = 'data/canada_provinces.json';

    function updateLineChart(city) {
        if (!city || !rentalData[city.city]) {
            return;
        }
        
        chartTitle.text(`${city.city} - Rental Prices Over Time`);
        
        const cityRentalData = rentalData[city.city];
        
        // Filter and prepare data for visible housing types
        const filteredData = years.map(year => {
            const yearData = { year };
            housingTypes.forEach(type => {
                if (visibleHousingTypes.has(type) && cityRentalData[year] && cityRentalData[year][type]) {
                    yearData[type] = cityRentalData[year][type];
                }
            });
            return yearData;
        });
        
        // Clear previous chart
        chartG.selectAll('*').remove();
        
        // Scales
        const xScale = d3.scaleLinear()
            .domain([2020, 2024])
            .range([0, chartWidth]);
        
        const allValues = filteredData.flatMap(d => 
            housingTypes
                .filter(type => visibleHousingTypes.has(type))
                .map(type => d[type])
                .filter(v => v !== undefined)
        );
        
        if (allValues.length === 0) {
            chartG.append('text')
                .attr('x', chartWidth / 2)
                .attr('y', chartHeight / 2)
                .attr('text-anchor', 'middle')
                .style('fill', '#999')
                .text('No data available');
            return;
        }
        
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(allValues) * 1.1])
            .range([chartHeight, 0]);
        
        // Axes
        chartG.append('g')
            .attr('transform', `translate(0,${chartHeight})`)
            .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format('d')))
            .style('font-size', '11px');
        
        chartG.append('g')
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => '$' + d))
            .style('font-size', '11px');
        
        // Y-axis label
        chartG.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -40)
            .attr('x', -chartHeight / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#666')
            .text('Monthly Rent ($)');
        
        // Line generator
        const line = d3.line()
            .defined(d => d !== undefined)
            .x((d, i) => xScale(years[i]))
            .y(d => yScale(d));
        
        // Draw lines for each housing type
        housingTypes.forEach(type => {
            if (!visibleHousingTypes.has(type)) return;
            
            const typeData = filteredData.map(d => d[type]);
            
            if (typeData.some(v => v !== undefined)) {
                // Line
                chartG.append('path')
                    .datum(typeData)
                    .attr('fill', 'none')
                    .attr('stroke', housingTypeColors[type])
                    .attr('stroke-width', 2.5)
                    .attr('d', line);
                
                // Points
                chartG.selectAll(`.point-${type.replace(/\s+/g, '-')}`)
                    .data(typeData)
                    .join('circle')
                    .attr('class', `point-${type.replace(/\s+/g, '-')}`)
                    .attr('cx', (d, i) => xScale(years[i]))
                    .attr('cy', d => d !== undefined ? yScale(d) : null)
                    .attr('r', d => d !== undefined ? 4 : 0)
                    .attr('fill', housingTypeColors[type])
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 1.5)
                    .style('cursor', 'pointer')
                    .on('mouseenter', function(event, d, i) {
                        if (d !== undefined) {
                            const yearIndex = typeData.indexOf(d);
                            d3.select(this)
                                .transition()
                                .duration(100)
                                .attr('r', 6);
                            
                            chartTooltip
                                .html(`<strong>${type.replace(' units', '')}</strong><br/>${years[yearIndex]}: <strong>$${Math.round(d)}</strong>`)
                                .style('display', 'block')
                                .style('opacity', 1)
                                .style('left', (event.clientX + 10) + 'px')
                                .style('top', (event.clientY - 10) + 'px');
                        }
                    })
                    .on('mousemove', function(event) {
                        chartTooltip
                            .style('left', (event.clientX + 10) + 'px')
                            .style('top', (event.clientY - 10) + 'px');
                    })
                    .on('mouseleave', function() {
                        d3.select(this)
                            .transition()
                            .duration(100)
                            .attr('r', 4);
                        
                        chartTooltip
                            .style('display', 'none')
                            .style('opacity', 0);
                    });
            }
        });
        
        chartContainer.style('display', 'block');
    }

    // load data
    Promise.all([
        d3.json(PROVINCES_URL),
        d3.csv('data/canadacities_clean.csv'),
        d3.csv('data/rental_city_merged.csv')
    ]).then(function(results) {
        // Remove loading indicator
        const loadingIndicator = document.getElementById('map-loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        const provincesGeo = results[0];
        const rows = results[1];
        const rentalRows = results[2];
        
        // Validate data
        if (!provincesGeo || !provincesGeo.features || provincesGeo.features.length === 0) {
            throw new Error('Province data is invalid or empty');
        }
        if (!rows || rows.length === 0) {
            throw new Error('City data is invalid or empty');
        }
        if (!rentalRows || rentalRows.length === 0) {
            throw new Error('Rental data is invalid or empty');
        }
        
        console.log(`Loaded: ${provincesGeo.features.length} provinces, ${rows.length} cities, ${rentalRows.length} rental records`);
        
        // Mark as initialized
        cityMapInitialized = true;
        
        // Process rental data
        rentalRows.forEach(r => {
            const city = r.city;
            const year = +r.year;
            const housingType = r.housing_type;
            const rentPrice = +r.rent_price;
            
            if (!rentalData[city]) {
                rentalData[city] = {};
            }
            if (!rentalData[city][year]) {
                rentalData[city][year] = {};
            }
            // Average if multiple structure types exist
            if (rentalData[city][year][housingType]) {
                rentalData[city][year][housingType] = (rentalData[city][year][housingType] + rentPrice) / 2;
            } else {
                rentalData[city][year][housingType] = rentPrice;
            }
        });
        
        // Calculate average rent for each city-year and find global min/max for consistent color scale
        const cityAverageRents = {}; // { cityName: { year: avgRent } }
        
        const legendContainer = d3.select(mapContainer)
            .append('div')
            .attr('class', 'rent-legend')
            .attr('id', 'rent-legend')
            .style('position', 'absolute')
            .style('bottom', '20px')
            .style('left', '20px')
            .style('background', 'rgba(255, 255, 255, 0.95)')
            .style('padding', '15px')
            .style('border-radius', '8px')
            .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
            .style('z-index', '1000')
            .style('font-size', '12px')
            .style('width', '280px');
        
        legendContainer.append('div')
            .attr('class', 'legend-title')
            .style('font-weight', '600')
            .style('margin-bottom', '8px')
            .style('color', '#2d3748')
            .style('text-align', 'center')
            .text('Average Rent/Month - All Types');
        
        const legendSvg = legendContainer.append('svg')
            .attr('width', 250)
            .attr('height', 50)
            .style('display', 'block')
            .style('margin', '0 auto');
        
        // Create gradient for legend
        const defs = legendSvg.append('defs');
        defs.append('linearGradient')
            .attr('id', 'rent-gradient-housing')
            .attr('x1', '0%')
            .attr('x2', '100%');
        
        // Draw gradient rectangle
        legendSvg.append('rect')
            .attr('x', 0)
            .attr('y', 5)
            .attr('width', 250)
            .attr('height', 20)
            .style('fill', 'url(#rent-gradient-housing)')
            .style('stroke', '#ccc')
            .style('stroke-width', 1);
        
        // Add labels (text will be updated by updateLegend)
        legendSvg.append('text')
            .attr('class', 'legend-min-label')
            .attr('x', 0)
            .attr('y', 38)
            .style('font-size', '11px')
            .style('fill', '#666');
        
        legendSvg.append('text')
            .attr('class', 'legend-max-label')
            .attr('x', 250)
            .attr('y', 38)
            .attr('text-anchor', 'end')
            .style('font-size', '11px')
            .style('fill', '#666');
        
    // Function to update the legend display
    function updateLegend() {
            // Update legend title with housing type
            const filterHousingTypeLabels = {
                'All': 'All Types (Average)',
                'Bachelor units': 'Bachelor',
                'One bedroom units': '1 Bedroom',
                'Two bedroom units': '2 Bedrooms',
                'Three bedroom units': '3 Bedrooms'
            };
            const housingLabel = filterHousingTypeLabels[selectedHousingType] || 'All Types';
            const titleElement = d3.select('#rent-legend .legend-title');
            titleElement.text(`Average Rent/Month - ${housingLabel}`);
            
            // Update legend labels with new min/max
            const minLabel = d3.select('#rent-legend .legend-min-label');
            const maxLabel = d3.select('#rent-legend .legend-max-label');
            minLabel.text(`$${Math.round(globalMinRent)}`);
            maxLabel.text(`$${Math.round(globalMaxRent)}`);
            
            // Update gradient stops
            const linearGradient = d3.select('#rent-gradient-housing');
            linearGradient.selectAll('stop').remove();
            
            const numStops = 10;
            for (let i = 0; i <= numStops; i++) {
                const offset = (i / numStops) * 100;
                const value = globalMinRent + (globalMaxRent - globalMinRent) * (i / numStops);
                linearGradient.append('stop')
                    .attr('offset', `${offset}%`)
                    .attr('stop-color', rentColorScale(value));
            }
        }        // Function to recalculate rent data based on current housing type filter
        recalculateRentData = function() {
            // Clear previous calculations
            Object.keys(rentalData).forEach(cityName => {
                cityAverageRents[cityName] = {};
            });
            globalMinRent = Infinity;
            globalMaxRent = -Infinity;
            
            // Recalculate based on selected housing type
            Object.keys(rentalData).forEach(cityName => {
                Object.keys(rentalData[cityName]).forEach(year => {
                    const yearData = rentalData[cityName][year];
                    let rentValues;
                    
                    if (selectedHousingType === 'All') {
                        // Average across all housing types
                        rentValues = Object.values(yearData).filter(v => v > 0);
                    } else {
                        // Only use selected housing type
                        if (yearData[selectedHousingType] && yearData[selectedHousingType] > 0) {
                            rentValues = [yearData[selectedHousingType]];
                        } else {
                            rentValues = [];
                        }
                    }
                    
                    if (rentValues.length > 0) {
                        const avgRent = rentValues.reduce((a, b) => a + b, 0) / rentValues.length;
                        cityAverageRents[cityName][year] = avgRent;
                        globalMinRent = Math.min(globalMinRent, avgRent);
                        globalMaxRent = Math.max(globalMaxRent, avgRent);
                    }
                });
            });
            
            // Recreate color scale with new min/max
            rentColorScale = d3.scaleSequential()
                .domain([globalMinRent, globalMaxRent])
                .interpolator(d3.interpolateGreens)
                .unknown('#999');
            
            // Update getCityColor to use new scale
            getCityColor = function(cityName) {
                if (!cityAverageRents[cityName] || !cityAverageRents[cityName][currentYear]) {
                    return '#999'; // gray for no data
                }
                return rentColorScale(cityAverageRents[cityName][currentYear]);
            };
            
            // Refresh legend with the new scale and ranges
            updateLegend();
        };
        
        // Initial calculation with 'All' housing types
        recalculateRentData();
        
        // Update the function to handle city color changes when year changes
        updateCityColors = function() {
            // Get all city circles and update their fill colors and visibility
            const allCircles = gCities.selectAll('circle.city');
            
            const baseRadius = 4;
            const minVisualRadius = 0.3;
            const currentTransform = d3.zoomTransform(svg.node());
            const scaledRadius = Math.max(minVisualRadius, baseRadius / currentTransform.k);
            
            allCircles.each(function(d) {
                const circle = d3.select(this);
                const hasData = cityAverageRents[d.city] && cityAverageRents[d.city][currentYear];
                
                if (hasData) {
                    // City has data for current year - show with color
                    const newColor = selectedCity && d.city === selectedCity.city ? '#2100f7ff' : getCityColor(d.city);
                    circle
                        .transition().duration(300)
                        .style('display', 'block')
                        .style('opacity', 1)
                        .attr('r', scaledRadius)
                        .attr('fill', newColor);
                } else {
                    // City has no data for current year - hide
                    circle
                        .transition().duration(300)
                        .style('opacity', 0)
                        .attr('r', 0)
                        .on('end', function() {
                            d3.select(this).style('display', 'none');
                        });
                }
            });
        };
        
        // Legend was moved earlier in the code - removed duplicate here

        const projection = d3.geoAlbers()
            .center([0, 58])
            .rotate([96, 0])
            .parallels([49, 77])
            .scale(1500)
            .translate([innerWidth / 2, innerHeight / 2]); // converts longtitude, latitude to x,y 
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

        const cityTransition = 300; // ms for city fade transitions

        // Draw provinces (now interactive - click to zoom)
        const provinceElements = gProvinces.selectAll('path.province')
            .data(provincesGeo.features)
            .join('path')
            .attr('class', 'province')
            .attr('d', path)
            .attr('fill', '#d3d3d3')
            .attr('stroke', '#ffffff')
            .style('stroke-width', 0.8)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .style('shape-rendering', 'geometricPrecision')
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .on('click', function(event, d) {
                event.stopPropagation();
                
                // Calculate bounds of the clicked province
                const bounds = path.bounds(d);
                const dx = bounds[1][0] - bounds[0][0];
                const dy = bounds[1][1] - bounds[0][1];
                const x = (bounds[0][0] + bounds[1][0]) / 2;
                const y = (bounds[0][1] + bounds[1][1]) / 2;
                
                // Calculate scale and translate to fit province
                const scale = Math.min(8, 0.9 / Math.max(dx / innerWidth, dy / innerHeight));
                const translate = [innerWidth / 2 - scale * x, innerHeight / 2 - scale * y];
                
                // Animate zoom to province
                svg.transition()
                    .duration(750)
                    .call(
                        zoom.transform,
                        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
                    );
            })
            .on('mouseenter', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('fill', '#c0c0c0');
                
                // Show province name in tooltip
                tooltip
                    .text(d.properties.name || 'Unknown Province')
                    .style('display', 'block')
                    .style('opacity', 1)
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mousemove', function(event, d) {
                // Update tooltip position while hovering over province
                tooltip
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mouseleave', function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('fill', '#d3d3d3');
                
                // Hide tooltip
                tooltip.style('display', 'none').style('opacity', 0).text('');
            });

        
        // Create city circles ONLY for cities that have valid rental data (non-zero prices)
        // Visibility will be controlled by updateCityColors based on current year
        const cityCircles = gCities.selectAll('circle.city')
            .data(cities.filter(d => {
                // Check if city has average rent data (filters out cities with all 0.0 prices)
                return cityAverageRents[d.city] && Object.keys(cityAverageRents[d.city]).length > 0;
            }))
            .join('circle')
            .attr('class', 'city')
            .attr('cx', function(d) { return projection([d.lon, d.lat])[0]; })
            .attr('cy', function(d) { return projection([d.lon, d.lat])[1]; })
            .attr('r', d => {
                // Show only if has data for current year
                return cityAverageRents[d.city] && cityAverageRents[d.city][currentYear] ? 4 : 0;
            })
            .attr('fill', d => getCityColor(d.city))
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .style('display', d => {
                // Show only if has data for current year
                return cityAverageRents[d.city] && cityAverageRents[d.city][currentYear] ? 'block' : 'none';
            })
            .style('opacity', d => {
                // Show only if has data for current year
                return cityAverageRents[d.city] && cityAverageRents[d.city][currentYear] ? 1 : 0;
            })
            .on('click', function(event, d) {
                // Prevent event from bubbling to map
                event.stopPropagation();
                
                // Check if this city has rental data
                if (rentalData[d.city]) {
                    selectedCity = d;
                    updateLineChart(d);
                    
                    // Highlight selected city
                    cityCircles.each(function(c) {
                        if (c === d) {
                            d3.select(this).attr('fill', '#e53e3e');
                        } else {
                            d3.select(this).attr('fill', getCityColor(c.city));
                        }
                    });
                } else {
                    alert(`No rental data available for ${d.city}`);
                }
            })
            .on('mouseenter', function(event, d) {
                const circle = d3.select(this);
                const originalColor = circle.attr('fill');
                
                // Store original color and change to hover color
                circle.attr('data-original-color', originalColor);
                circle.transition()
                    .duration(150)
                    .attr('fill', '#ff6b35')
                    .attr('r', d => {
                        const currentTransform = d3.zoomTransform(svg.node());
                        const baseRadius = 4;
                        const minVisualRadius = 0.3;
                        const scaledRadius = Math.max(minVisualRadius, baseRadius / currentTransform.k);
                        return scaledRadius * 1.5; // Make it 50% larger on hover
                    });
                
                // Show only city name in tooltip (use clientX/clientY for fixed positioning)
                tooltip
                    .text(d.city)
                    .style('display', 'block')
                    .style('opacity', 1)
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mousemove', function(event, d) {
                // update tooltip position while hovering (use clientX/clientY for fixed positioning)
                tooltip
                    .style('left', (event.clientX + 10) + 'px')
                    .style('top', (event.clientY + 10) + 'px');
            })
            .on('mouseleave', function(event, d) {
                const circle = d3.select(this);
                const originalColor = circle.attr('data-original-color');
                
                // Only restore color and size if this city is NOT currently selected
                if (!selectedCity || selectedCity.city !== d.city) {
                    circle.transition()
                        .duration(150)
                        .attr('fill', originalColor)
                        .attr('r', d => {
                            const currentTransform = d3.zoomTransform(svg.node());
                            const baseRadius = 4;
                            const minVisualRadius = 0.3;
                            return Math.max(minVisualRadius, baseRadius / currentTransform.k);
                        });
                } else {
                    // Keep selected color but restore size
                    circle.transition()
                        .duration(150)
                        .attr('r', d => {
                            const currentTransform = d3.zoomTransform(svg.node());
                            const baseRadius = 4;
                            const minVisualRadius = 0.3;
                            return Math.max(minVisualRadius, baseRadius / currentTransform.k);
                        });
                }
                
                // Hide tooltip
                tooltip.style('display', 'none').style('opacity', 0).text('');
            });

        const zoom = d3.zoom()
            .scaleExtent([1, 20])
            .translateExtent([[0, 0], [innerWidth, innerHeight]])
            .on('zoom', function(event) {
                gRoot.attr('transform', event.transform);

                // Scale circles inversely so they appear smaller as you zoom in (reduces overlap)
                const baseRadius = 4;
                const minVisualRadius = 0.3; // Allow circles to get quite small when fully zoomed
                const scaledRadius = Math.max(minVisualRadius, baseRadius / event.transform.k);

                // Update all city circles (re-select to ensure we get current circles)
                gCities.selectAll('circle.city').attr('r', scaledRadius);
                
                // Scale province stroke-width with k^2 so it gets thinner faster when zooming in
                const baseStrokeWidth = 1.2; // base at k=1
                const minStrokeWidth = 0.05; // Minimum border thickness when fully zoomed in
                const scaledStrokeWidth = Math.max(minStrokeWidth, baseStrokeWidth / (event.transform.k * event.transform.k));
                gProvinces.selectAll('path.province').style('stroke-width', scaledStrokeWidth);
            });

        svg.call(zoom);
        
        // Click on empty space to reset zoom
        svg.on('click', function(event) {
            // Only reset if clicking directly on SVG (not on provinces or cities)
            if (event.target === this || event.target.tagName === 'svg') {
                svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
            }
        });

        zoomInBtn.on('click', function() {
            svg.transition().duration(300).call(zoom.scaleBy, 1.3);
        });

        zoomOutBtn.on('click', function() {
            svg.transition().duration(300).call(zoom.scaleBy, 0.77);
        });

        resetBtn.on('click', function() {
            svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
        });

    }).catch(function(err) {
        console.error('Failed to load map data:', err);
        
        // Reset initialization flag on error
        cityMapInitialized = false;
        
        // Remove loading indicator
        const loadingIndicator = document.getElementById('map-loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        // Display error message to user
        mapContainer.innerHTML = `
            <div style="
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100%;
                min-height: 400px;
                flex-direction: column;
                color: #c53030;
                font-size: 1.2em;
                text-align: center;
                padding: 40px;
            ">
                <div style="font-weight: 700; margin-bottom: 10px;">⚠️ Error Loading Visualization</div>
                <div style="font-size: 0.9em; color: #666;">
                    Failed to load rental data. Please refresh the page or check your connection.
                </div>
                <div style="font-size: 0.8em; color: #999; margin-top: 10px;">
                    Error: ${err.message || 'Unknown error'}
                </div>
                <button onclick="cityMapInitialized = false; initCityMap();" style="
                    margin-top: 20px;
                    padding: 10px 20px;
                    background: #48bb78;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                ">
                    Retry
                </button>
            </div>
        `;
    });
}
