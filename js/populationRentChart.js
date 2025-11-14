
/*
 * PopulationRentChart - ES6 Class
 * @param  parentElement 	-- the HTML element in which to draw the visualization
 * @param  data             -- the data the that's provided initially
 *
 * @param  focus            -- a switch that indicates the current mode (focus or stacked overview)
 * @param  selectedIndex    -- a global 'variable' inside the class that keeps track of the index of the selected area
 */

let NUM_CATEGORIES = 11;

class PopulationRentChart {

// constructor method to initialize PopulationRentChart object
constructor(parentElement, citySearch, cityList, dropdown, filterParent, selectionArea, data) {
    this.parentElement = parentElement;

    // sorting the data to make accumulation logic simpler
    this.data = data.sort(function(a, b)    {
        return a.year - b.year || a.province.localeCompare(b.province)
    })

    this.displayData = [];

    // A list of all provinces in the dataset
    this.provinces = [...new Set(data.map(item => item.province))];
    // Has all cities / provinces currently displayed in the chart
    this.displayCategories = this.provinces

    // Constructing an object mapping provinces to the cities they contain
    this.cityFilter = this.provinces.reduce((acc, province) => {
                        acc[province] = [];
                        return acc;
                    }, {});

    this.data.forEach(e => {
        this.cityFilter[e.province].push(e.city)
    });

    // Inverse mapping of cities to provinces
    this.cityProvinceMap = {}
    this.provinceCityMap = {}
    let vis = this;

    this.provinces.forEach(e => {
        let citySet = [...new Set(this.cityFilter[e])];
        let currObj = {"self": true};
        this.provinceCityMap[e] = [];
        citySet.forEach(c =>    {
            currObj[c] = false;
            vis.cityProvinceMap[c] = e;
            vis.provinceCityMap[e].push(c)
        })
        this.cityFilter[e] = currObj;
    })

    // Set ordinal color scale
    vis.popColorScale = d3.scaleLinear()
        .range(["green", "yellow", "red"]);
    vis.avgColorScale = d3.scaleLinear()
        .range(["green", "yellow", "red"]);

    this.selectionArea = selectionArea;
    this.areaSearch = d3.select("#" + citySearch);
    this.cityList = document.getElementById(cityList);
    this.dropdown = d3.select("#" + dropdown);
    this.filterParent = d3.select("#" + filterParent);
    document.getElementById("vis5-city-search").value = "";

    this.initLegend();
}

	/*
	 * Method that initializes the visualization (static content, e.g. SVG area or axes)
 	*/
	initVis(){
		let vis = this;

		vis.margin = {top: 25, right: 100, bottom: 25, left: 175};

		vis.width = document.getElementById(vis.parentElement).getBoundingClientRect().width - vis.margin.left - vis.margin.right;
		vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height - vis.margin.top - vis.margin.bottom;

		// SVG drawing area
		vis.svg = d3.select("#" + vis.parentElement).append("svg")
			.attr("width", vis.width + vis.margin.left + vis.margin.right)
			.attr("height", vis.height + vis.margin.top + vis.margin.bottom)
			.append("g")
			.attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");

		// Scales and axes
		vis.x = d3.scaleBand()
			.range([0, vis.width])
              .paddingInner(0.01);

		vis.y = d3.scaleBand()
			.range([vis.height, 0])
            .paddingInner(0.01);

		vis.xAxis = d3.axisBottom()
			.scale(vis.x);

		vis.yAxis = d3.axisLeft()
			.scale(vis.y)
		vis.svg.append("g")
			.attr("class", "x-axis axis")
			.attr("transform", "translate(0," + vis.height + ")");

		vis.svg.append("g")
			.attr("class", "y-axis axis")


        // create a tooltip
        vis.tooltip = d3.select("body")
            .append("div")
            .style("opacity", 0)
            .attr("class", "tooltip")
            .style("background-color", "white")
            .style("border", "solid")
            .style("border-width", "2px")
            .style("border-radius", "5px")
            .style("padding", "5px")
            .style("position", "absolute")
            .style("color", "black")
        vis.defs = vis.svg.append("defs");

        let resetButton = d3.select("#vis5-reset-filters");
        resetButton.on("click", function()  {
            
            Object.keys(vis.cityFilter).forEach((p) =>    {
                Object.keys(vis.cityFilter[p]).forEach((c) => {
                    vis.cityFilter[p][c] = false;
                })
            })
            vis.wrangleData();
        })

        const tabCities = document.getElementById("vis5-tab-cities");
        const tabProvinces = document.getElementById("vis5-tab-provinces");
        const provinceSelect = document.getElementById("vis5-province-select");
        vis.populateProvinceDropdown();

        // Tab switching
        tabCities.addEventListener("click", () => {
            tabCities.classList.add("active");
            tabProvinces.classList.remove("active");
            vis.areaSearch.style("display", "block")
            provinceSelect.style.display = "none";
        });

        tabProvinces.addEventListener("click", () => {
            tabProvinces.classList.add("active");
            tabCities.classList.remove("active");
            vis.areaSearch.style("display", "none")
            provinceSelect.style.display = "block";
            vis.dropdown.style("display", "none")
        });

        // Province selection
        provinceSelect.addEventListener("change", (e) => {
            const province = e.target.value;
            if (province) {
                vis.toggleLocation(province);
                e.target.value = ""; // Reset dropdown
            }
        });


        vis.createAreaFilters();
        vis.wrangleData();
	}

    initLegend() {
        let vis = this;
        const legendContainer = document.getElementById('vis5-legend');
        const parentContainer = legendContainer ? legendContainer.parentElement : null;

        if (legendContainer && parentContainer) {
            // 1. Create the Toggle Button (Opens/Closes)
            const button = document.createElement('button');
            button.id = 'legend-toggle-button';
            button.textContent = 'Show Legend';
            legendContainer.appendChild(button); 

            // 2. Create the Expanded Legend Overlay Div
            const overlayDiv = document.createElement('div');
            overlayDiv.id = 'expanded-legend-overlay';
            parentContainer.appendChild(overlayDiv);

            // --- NEW: Create the Close Button inside the overlay ---
            const closeButton = document.createElement('button');
            closeButton.id = 'close-legend-button';
            closeButton.textContent = 'Close';
            
            // Append the close button to the overlay div BEFORE D3 renders the SVG
            overlayDiv.appendChild(closeButton);

            // D3 selection for the overlay container
            vis.legendArea = d3.select(overlayDiv);
            const d3LegendArea = vis.legendArea; // Renaming for clarity in the toggle function

            // 3. Add Event Listeners for Toggle Functionality
            function toggleLegend() {
                const isHidden = overlayDiv.style.display === 'none' || overlayDiv.style.display === '';
                
                if (isHidden) {
                    // Show the overlay
                    overlayDiv.style.display = 'block';

                    // Call your visualization's legend creation function
                    vis.createLegend(d3LegendArea, null); 
                        
                    // Re-append the close button after createLegend clears and adds the SVG
                    d3LegendArea.node().appendChild(closeButton);
                    
                } else {
                    // Hide the overlay
                    overlayDiv.style.display = 'none';
                }
            }

            // Attach listeners
            button.addEventListener('click', toggleLegend);
            closeButton.addEventListener('click', toggleLegend); // Close button now calls toggleLegend
            
        } else {
            console.error("Required container elements ('vis5-legend' or its parent) not found. Ensure D3 is loaded.");
        }
    }

    sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    // Accumulates averages over the current displayCategory
    accumulateAvg() {
        let vis = this;
        let newData = [];

        // Collecting yearly averages across structure and unit types
        this.data.forEach(e =>  {
            let accAvg = 0;
            let num = 0;
            
            let include = vis.cityFilter[e.province][e.city] || vis.cityFilter[e.province].self;
                if (include)    {
                e.data.forEach(e => {
                    accAvg += e.avg * include;
                    num += include;
                })

                if (num > 0)    {
                    newData.push(e);
                    accAvg /= num;
                    newData[newData.length - 1].avg = accAvg
                }
            }
        })

        // Accumulate city data by province and average it out  
        let accumulatedData = [];

        Object.keys(vis.cityFilter).forEach(p =>    {
            Object.keys(vis.cityFilter[p]).forEach(c    =>  {
                let tempData = newData.filter(function(d)   {
                    if (c == "self")    {
                        return d.province == p && vis.cityFilter[p][c];
                    }   else    {
                        return d.city == c && vis.cityFilter[p][c];
                    }
                })

                
                if (tempData.length > 0)   {
                    let currYear = -1;
                    tempData.forEach(e =>   {
                        let currCategory = c;
                        if (c == "self")    {
                            currCategory = e.province;
                        }
                        let currObj = {category: currCategory, year: e.year, pop: e.pop, avg: e.avg, cityNum: 1}
        
                        if (c == "self")    {
                            if (e.year == currYear) {
                                accumulatedData[accumulatedData.length - 1].pop += e.pop;
                                accumulatedData[accumulatedData.length - 1].avg += e.avg;
                                accumulatedData[accumulatedData.length - 1].cityNum += 1;
                            }   else    {
                                currYear = e.year;
                                accumulatedData.push(currObj);
                            }
                        }   else   {
                            accumulatedData.push(currObj);
                        }
                    })
                }
            })
        })

        accumulatedData = accumulatedData.sort(function(a, b) {
            return b.category.localeCompare(a.category)
        })

        let categories = [];
        // final average calculation
        accumulatedData.forEach((e, i) =>   {
            e.avg /= e.cityNum

            // For some reason Parksville has 0 in rent for 2001 which i somehow doubt is correct, so this is the bandaid fix
            if (i == 0 || e.category != accumulatedData[i - 1].category || (e.category == "Parksville" && e.year == "2002")) {
                e.popChange = 0;
                e.avgChange = 0;
            }   else    {
                e.popChange = (e.pop - accumulatedData[i - 1].pop) / (accumulatedData[i - 1].pop) * 100
                e.avgChange = (e.avg - accumulatedData[i - 1].avg) / accumulatedData[i - 1].avg * 100;
            }

            if (i == 0 || e.categories != accumulatedData[i - 1].category)   {
                categories.push(e.category)
            }
        })

        vis.displayCategories = categories;
        let range = d3.extent(
            accumulatedData.filter(d => vis.displayCategories.includes(d.category)),
            d => d.popChange
        );

        vis.displayKeys = d3.ticks(range[0], range[1], NUM_CATEGORIES);
        vis.displayData = accumulatedData.filter(function (d)   {
            return d.year != "2001"
        })

    }


    // Update city dropdown list
    updateCityDropdown(searchTerm) {
        let vis = this;

        d3.select("#vis5-city-list").selectAll("*").remove();

        let toggled = []
        Object.keys(vis.cityFilter).forEach((p) =>    {
            Object.keys(vis.cityFilter[p]).forEach((c) => {
                if (vis.cityFilter[p][c])   {
                    if (c == "self")    {
                        toggled.push(p);
                    }   else     {
                        toggled.push(c);
                    }
                }
            })
        })

        let availableCities = Object.keys(vis.cityProvinceMap);
        // Filter by search term
        if (searchTerm) {
            availableCities = availableCities.filter(function (d) {
                if (d.toLowerCase().includes(searchTerm))    {
                    return true;
                }   

                let provinceQuery = vis.cityProvinceMap[d.toLowerCase()]
                if (provinceQuery != undefined && provinceQuery.toLowerCase().includes(searchTerm))    {
                    return true;
                }

                return false;
            });
        }

        // Add header
        const header = document.createElement("div");
        header.className = "dropdown-header";
        header.textContent = (searchTerm) ? `${availableCities.length} cities found` : `All ${Object.keys(vis.cityProvinceMap).length} cities`;
        vis.cityList.appendChild(header);

        if (availableCities.length === 0) {
            vis.cityList.innerHTML +=
            '<div style="padding: 20px; text-align: center; color: #718096;">No cities match your search</div>';
            return;
        }

        let currProvinces = []
        availableCities.forEach(e =>    {
            if (!(currProvinces.includes(vis.cityProvinceMap[e])) )   {
                currProvinces.push(vis.cityProvinceMap[e])
            }
        })

        // Display cities grouped by province
        currProvinces.forEach((province) => {
            // Province header
            const provinceHeader = document.createElement("div");
            provinceHeader.className = "province-group-header";

            let currCities = []
            availableCities.forEach(e =>    {
                if (vis.cityProvinceMap[e] == province) {
                    currCities.push(e);
                }
            })

            provinceHeader.textContent = `${province} (${
                currCities.length
            })`;
            vis.cityList.appendChild(provinceHeader);

            // Cities in this province (sorted alphabetically)
            const cities = vis.provinceCityMap[province].sort((a, b) => a.localeCompare(b));

            currCities.forEach((city) => {
                const isSelected = toggled.includes(city);

                const option = document.createElement("div");
                option.className = "city-option";

                if (isSelected) {
                    option.classList.add("selected");
                } 

                // Create city name span
                const cityName = document.createElement("span");
                cityName.textContent = city;
                option.appendChild(cityName);

                // All cities are clickable
                option.addEventListener("click", () => {
                    vis.toggleLocation(city)
                    document.getElementById("vis5-city-search").value = "";
                    vis.updateCityDropdown("")
                    vis.dropdown.style("display", "none");
                });

                vis.cityList.appendChild(option);
            });
        });
    }

    // Populate province dropdown with all provinces
    populateProvinceDropdown() {
        let vis = this;
        const provinceSelect = document.getElementById("vis5-province-select");

        // Add provinces to dropdown
        vis.provinces.forEach((province) => {
            const option = document.createElement("option");
            option.value = province;
            option.textContent = `${province}`;
            provinceSelect.appendChild(option);
        });
    }



    toggleLocation(loc) {
        let vis = this;
        if (Object.keys(vis.cityFilter).includes(loc))  {
            vis.cityFilter[loc].self = !vis.cityFilter[loc].self;
        }   else    {
            vis.cityFilter[vis.cityProvinceMap[loc]][loc] = !vis.cityFilter[vis.cityProvinceMap[loc]][loc];
        }
        vis.wrangleData();
    }

    // Update selected cities display
    updateSelectedCitiesDisplay() {
        let vis = this;
        const container = document.getElementById(vis.selectionArea);
        container.innerHTML = "";

        let toggled = []
        Object.keys(vis.cityFilter).forEach((p) =>    {
            Object.keys(vis.cityFilter[p]).forEach((c) => {
                if (vis.cityFilter[p][c])   {
                    if (c == "self")    {
                        toggled.push(p);
                    }   else     {
                        toggled.push(c);
                    }
                }
            })
        })
        if (toggled.length === 0) {
            container.innerHTML =
            '<div style="color: #718096; font-size: 0.9em; padding: 5px;">No cities selected</div>';
            return;
        }

        toggled.forEach((cityName) => {
            const tag = document.createElement("div");
            tag.className = "selected-city-tag";
            tag.innerHTML = `
                    <span>${cityName}</span>
                    <span class="remove-city" data-city="${cityName}">×</span>
                `;

            tag.querySelector(".remove-city").addEventListener("click", (e) => {
                e.stopPropagation();
                vis.toggleLocation(cityName)
            });

            container.appendChild(tag);
        });
    }


    createAreaFilters()    {
        let vis = this;

        // Show dropdown on focus
        vis.areaSearch.on("focus", () => {
            vis.updateCityDropdown("")
            vis.dropdown.style("display", "block");
        });

        vis.areaSearch.on("focusout", (d) => {
            if (d.explicitOriginalTarget.className != "city-option" && d.explicitOriginalTarget.className !=  "city-option selected")    {
                vis.dropdown.style("display", "none");
            }
            
        });

        // Filter dropdown as user types
        vis.areaSearch.on("input", (e, d) => {
            vis.updateCityDropdown(vis.areaSearch.property("value").toLowerCase())
        });

    }

	/*
 	* Data wrangling
 	*/
	wrangleData(){
		let vis = this;
        vis.accumulateAvg();
		vis.updateVis();
	}


    // Function to draw a single row
    drawRow(rowIndex, label, gradId, minValue, maxValue, svg) {
        let vis = this;
        const legendWidth = vis.legendArea.node().clientWidth;
        
        // --- Responsive Constants ---
        const rowHeight = 60; 
        const barHeight = 20; 
        const rowY = 50 + rowIndex * rowHeight; // Y position is relative to row index
        
        // Define proportional widths based on legendWidth
        const totalContentRatio = 0.9; // Use 90% of the legend width for content
        const barLabelAreaRatio = 0.75; // The bar/label section is 75% of totalContentRatio
        
        // Calculate widths and spacing based on ratios
        const totalContentWidth = legendWidth * totalContentRatio;
        const boxSize = 40; // Fixed size for the example box (can be made responsive too)
        const availableBarWidth = totalContentWidth - boxSize;
        
        // Ratios for spacing and bar/label width within the remaining space
        const spacingBoxBarRatio = 0.05; 
        const spacingBarLabelRatio = 0.05;
        const labelWidthRatio = 0.20; // 20% of the content width for the label
        
        // Calculate final pixel dimensions
        const spacingBoxBar = availableBarWidth * spacingBoxBarRatio;
        const spacingBarLabel = availableBarWidth * spacingBarLabelRatio;
        const labelWidth = totalContentWidth * labelWidthRatio;
        const barWidth = availableBarWidth - spacingBoxBar - spacingBarLabel - labelWidth;
        
        // Calculate X offset to center the content
        const xOffset = (legendWidth - totalContentWidth) / 2;

        // Group for the row
        const g = svg.append("g")
            .attr("transform", `translate(${xOffset}, ${rowY})`);

        const barY = (boxSize - barHeight) / 2;

        // --- 1. Example box ---
        g.append("rect")
            .attr("width", boxSize)
            .attr("height", boxSize)
            .attr("fill", "none")
            .attr("stroke", "#555");

        // Triangles inside box
        g.append("path")
            .attr("d", `M0,${boxSize} L${boxSize},${boxSize} L0,0 Z`)
            .attr("fill", (rowIndex == 1) ? "white" : "red"); 
        g.append("path")
            .attr("d", `M${boxSize},0 L${boxSize},${boxSize} L0,0 Z`)
            .attr("fill", (rowIndex == 1) ? "red" : "white")

        // --- 2. Gradient bar ---
        const barX = boxSize + spacingBoxBar;
        g.append("rect")
            .attr("x", barX)
            .attr("y", barY)
            .attr("width", barWidth)
            .attr("height", barHeight)
            .attr("fill", `url(#${gradId})`);

        // --- 3. Min/max numbers ---
        g.append("text")
            .attr("x", barX)
            .attr("y", barY - 4)
            .attr("font-size", "0.8em") // Use relative font size
            .text(`${minValue.toFixed(2)}%`);
        g.append("text")
            .attr("x", barX + barWidth)
            .attr("y", barY - 4)
            .attr("font-size", "0.8em") // Use relative font size
            .attr("text-anchor", "end")
            .text(`${maxValue.toFixed(2)}%`);

        // --- 4. Row label ---
        g.append("text")
            .attr("x", barX + barWidth + spacingBarLabel)
            .attr("y", boxSize / 2)
            .attr("dominant-baseline", "middle")
            .attr("font-size", "1em") // Use relative font size
            .text(label);
    }

    // Function to create the gradient (no change needed here, it's already responsive)
    createGradient(svg, id, colors) {
        const grad = svg.append("defs")
            .append("linearGradient")
            .attr("id", id)
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "0%");
        
        grad.selectAll("stop")
            .data(colors)
            .enter()
            .append("stop")
            .attr("offset", (d, i) => `${i / (colors.length - 1) * 100}%`)
            .attr("stop-color", d => d);
    }

// Function to set up the legend area
createLegend() {
    let vis = this;

    // --- Bug Fix: Data Check and Safe Fallback ---
    const dataExists = vis.displayData && vis.displayData.length > 0;
    
    // Define safe fallback values in case data is missing
    let popMin = 0, popMax = 100;
    let rentMin = 0, rentMax = 100;

    if (dataExists) {
        popMin = d3.min(vis.displayData, d => d.popChange);
        popMax = d3.max(vis.displayData, d => d.popChange);
        rentMin = d3.min(vis.displayData, d => d.avgChange);
        rentMax = d3.max(vis.displayData, d => d.avgChange);
    } else {
        console.warn("vis.displayData is empty or null. Displaying default range (0% to 100%).");
    }
    // --- End Bug Fix ---


    // It's critical to get the clientWidth dynamically for responsiveness
    const legendWidth = vis.legendArea.node().clientWidth;
    const padding = 10;
    const rowHeight = 60; // Now using a fixed row height
    const numRows = 2;

    // Clear previous legend
    vis.legendArea.selectAll("*").remove();

    // Calculate total height dynamically
    const totalHeight = padding * 2 + 30 + numRows * rowHeight;

    // Append SVG
    const svg = vis.legendArea.append("svg")
        .attr("width", legendWidth)
        .attr("height", totalHeight);

    // Title
    svg.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", padding + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", "1.5em") // Use relative font size
        .attr("font-weight", "bold")
        .text("Legend");
        
    // --- Optional: Add a warning message inside the SVG if data is missing ---
    if (!dataExists) {
         svg.append("text")
            .attr("x", legendWidth / 2)
            .attr("y", padding + 12 + 30)
            .attr("text-anchor", "middle")
            .attr("font-size", "0.75em")
            .attr("fill", "#dc3545")
            .text("No data available.");
    }

    vis.createGradient(svg, "popGrad", ["green","yellow","red"]);
    vis.createGradient(svg, "rentGrad", ["green","yellow","red"]);

    // Use the calculated safe min/max values in drawRow calls
    vis.drawRow(0, "Population", "popGrad", popMin, popMax, svg);
    vis.drawRow(1, "Rent", "rentGrad", rentMin, rentMax, svg);
}
    destructVis()   {
        let vis = this;
        d3.select("#" + vis.selectionArea).selectAll("*").remove();
        d3.select("#" + vis.parentElement).selectAll("*").remove();

        document.getElementById("expanded-legend-overlay").style.display = 'none';
    }

	updateVis(){
        let vis = this;

        vis.x.domain([...new Set(vis.displayData.map(d => d.year))]);
        vis.y.domain(vis.displayCategories); // includes new rows

        vis.popColorScale.domain([
            d3.min(vis.displayData, d => d.popChange),
            d3.median(vis.displayData, d => d.popChange),
            d3.max(vis.displayData, d => d.popChange)
        ]);

        vis.avgColorScale.domain([
            d3.min(vis.displayData, d => d.avgChange),
            d3.median(vis.displayData, d => d.avgChange),
            d3.max(vis.displayData, d => d.avgChange)
        ]);

        vis.updateSelectedCitiesDisplay()
        vis.createLegend();

        vis.svg.selectAll(".box-group")
            .data(vis.displayData, d => `${d.year}-${d.category}`)
            .join(
                enter => {
                    const g = enter.append("g")
                        .attr("class", "box-group")
                        .attr("transform", d => `translate(${vis.x(d.year)}, ${vis.y(d.category)})`);

                    // Dimensions
                    const bw = vis.x.bandwidth();
                    const bh = vis.y.bandwidth();

                    // Border rect
                    g.append("rect")
                        .attr("width", bw)
                        .attr("height", bh)
                        .style("fill", "none")
                        .style("stroke", "#555")
                        .style("stroke-width", 1);

                    // Population triangle
                    g.append("path")
                        .attr("class", "pop-tri")
                        .attr("d", `M0,${bh} L${bw},${bh} L0,0 Z`)
                        .style("fill", d => vis.popColorScale(d.popChange));

                    // Rent triangle
                    g.append("path")
                        .attr("class", "rent-tri")
                        .attr("d", `M${bw},0 L${bw},${bh} L0,0 Z`)
                        .style("fill", d => vis.avgColorScale(d.avgChange));

                    // Diagonal line (hidden initially)
                    g.append("line")
                        .attr("class", "diag")
                        .attr("x1", 0)
                        .attr("y1", 0)
                        .attr("x2", bw)
                        .attr("y2", bh)
                        .attr("stroke", "black")
                        .attr("stroke-width", 1.5)
                        .style("opacity", 0);

                    // Hover events
                    g.on("mouseover", function(event, d) {
                        d3.select(this).select("rect")
                            .style("stroke", "black")
                            .style("stroke-width", 2);

                        d3.select(this).select(".diag")
                            .style("opacity", 1);

                        vis.tooltip
                            .style("opacity", 1)
                            .html(`
                                <strong>${d.category}</strong><br/>
                                Year: ${d.year}<br/>
                                Change in Rent: ${d.avgChange.toFixed(2)}%<br/>
                                Change in Population: ${d.popChange.toFixed(2)}%
                            `);
                    })
                    .on("mousemove", function(event) {
                        vis.tooltip
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY + 10) + "px");
                    })
                    .on("mouseleave", function() {
                        d3.select(this).select("rect")
                            .style("stroke", "#555")
                            .style("stroke-width", 1);

                        d3.select(this).select(".diag")
                            .style("opacity", 0);

                        vis.tooltip.style("opacity", 0);
                    });

                    return g;
                },
                update => {
                    // Update positions and dimensions
                    const bw = vis.x.bandwidth();
                    const bh = vis.y.bandwidth();

                    update
                        .attr("transform", d => `translate(${vis.x(d.year)}, ${vis.y(d.category)})`);

                    update.select("rect")
                        .attr("width", bw)
                        .attr("height", bh);

                    update.select(".pop-tri")
                        .attr("d", `M0,${bh} L${bw},${bh} L0,0 Z`)
                        .style("fill", d => vis.popColorScale(d.popChange));

                    update.select(".rent-tri")
                        .attr("d", `M${bw},0 L${bw},${bh} L0,0 Z`)
                        .style("fill", d => vis.avgColorScale(d.avgChange));

                    update.select(".diag")
                        .attr("x2", bw)
                        .attr("y2", bh);

                    return update;
                },
                exit => exit.remove()
            );

        vis.svg.select(".x-axis").call(vis.xAxis);
        vis.svg.select(".y-axis").call(vis.yAxis);

	}
}