// Set current year in footer
document.getElementById('current-year').textContent = new Date().getFullYear();

// Load and create the building visualization
d3.json('cleared_data/Burak\'s-cleared-data/cities_data.json').then(data => {
    createBuildingVisualization(data);
}).catch(error => {
    console.error('Error loading data:', error);
    document.getElementById('buildings-container').innerHTML =
        '<p style="color: #ff6b6b; text-align: center;">Error loading visualization data.</p>';
});

function createBuildingVisualization(cities) {
    const container = d3.select('#buildings-container');

    // Sort cities by population
    cities.sort((a, b) => b.population - a.population);

    // Calculate scales
    const maxPopulation = d3.max(cities, d => d.population);
    const minPopulation = d3.min(cities, d => d.population);
    const maxRent = d3.max(cities, d => d.avg_rent);
    const minRent = d3.min(cities, d => d.avg_rent);

    const populationScale = d3.scaleLinear()
        .domain([minPopulation, maxPopulation])
        .range([16, 48]);

    const chimneyHeightScale = d3.scaleLinear()
        .domain([minRent, maxRent])
        .range([40, 100]);

    cities.forEach(city => {
        const totalWindows = Math.round(populationScale(city.population));
        const cols = 4;

        // Calculate exact vacancy - including fractional part
        const exactVacantWindows = totalWindows * (city.vacancy_rate / 100);
        const fullVacantCount = Math.floor(exactVacantWindows);
        const partialVacantPercent = exactVacantWindows - fullVacantCount;

        const fullOccupiedCount = Math.floor(totalWindows - exactVacantWindows);
        const hasPartialWindow = partialVacantPercent > 0;

        // Create building container
        const buildingDiv = container.append('div')
            .attr('class', 'city-building');

        // Chimney container
        const chimneyContainer = buildingDiv.append('div')
            .attr('class', 'smoke-container');

        // Add chimney with variable height based on rent
        const chimneyHeight = Math.round(chimneyHeightScale(city.avg_rent));
        const chimney = chimneyContainer.append('div')
            .attr('class', 'chimney')
            .style('height', `${chimneyHeight}px`);

        // Add dollar sign inside chimney
        chimney.append('div')
            .attr('class', 'chimney-dollar')
            .text('$');

        // Building structure
        const building = buildingDiv.append('div')
            .attr('class', 'building');

        const windowsGrid = building.append('div')
            .attr('class', 'windows-grid')
            .style('grid-template-columns', `repeat(${cols}, 1fr)`);

        // Create windows array with occupied, vacant, and partial
        const windows = [];

        // Add fully occupied windows
        for (let i = 0; i < fullOccupiedCount; i++) {
            windows.push({ type: 'occupied', fill: 1.0 });
        }

        // Add partially filled window if needed
        if (hasPartialWindow) {
            windows.push({ type: 'partial', fill: 1 - partialVacantPercent });
        }

        // Add fully vacant windows
        for (let i = 0; i < fullVacantCount; i++) {
            windows.push({ type: 'vacant', fill: 0 });
        }

        // Shuffle the windows array
        for (let i = windows.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [windows[i], windows[j]] = [windows[j], windows[i]];
        }

        // Add windows to grid
        windows.forEach((window, index) => {
            const windowDiv = windowsGrid.append('div')
                .attr('class', `window ${window.type}`)
                .attr('title',
                    window.type === 'occupied' ? 'Occupied unit' :
                    window.type === 'vacant' ? 'Vacant unit' :
                    `Partially occupied (${Math.round(window.fill * 100)}%)`
                );

            // For partial windows, create a gradient fill
            if (window.type === 'partial') {
                const fillPercent = window.fill * 100;
                windowDiv.style('background',
                    `linear-gradient(to top, #f6ad55 0%, #ed8936 ${fillPercent}%, #e2e8f0 ${fillPercent}%, #e2e8f0 100%)`
                );
            }
        });

        // City label
        const isHighVacancy = city.vacancy_rate > 2.0;
        const label = buildingDiv.append('div')
            .attr('class', isHighVacancy ? 'city-label high-vacancy' : 'city-label');

        label.append('div')
            .attr('class', 'city-name')
            .text(city.city);

        label.append('div')
            .attr('class', 'city-stats')
            .html(`
                <div><strong>Vacancy:</strong> ${city.vacancy_rate}%</div>
                <div><strong>Avg Rent:</strong> $${Math.round(city.avg_rent)}</div>
                <div><strong>Pop:</strong> ${formatPopulation(city.population)}</div>
            `);

        // Keep green background for high vacancy cities, but don't show badge text
        // The green styling is applied via the 'high-vacancy' class on the label
    });
}

function formatPopulation(pop) {
    if (pop >= 1000000) {
        return (pop / 1000000).toFixed(1) + 'M';
    } else if (pop >= 1000) {
        return Math.round(pop / 1000) + 'K';
    }
    return pop.toString();
}
