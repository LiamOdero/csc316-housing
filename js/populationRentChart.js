
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
constructor(parentElement, areaSearch, filterParent, selectionArea, data) {
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
    let vis = this;

    this.provinces.forEach(e => {
        let citySet = [...new Set(this.cityFilter[e])];
        let currObj = {"self": true};
        citySet.forEach(c =>    {
            currObj[c] = false;
            vis.cityProvinceMap[c.toLowerCase()] = e;
        })
        this.cityFilter[e] = currObj;
    })

    // Set ordinal color scale
    vis.popColorScale = d3.scaleLinear()
        .range(["green", "yellow", "red"]);
    vis.avgColorScale = d3.scaleLinear()
        .range(["green", "yellow", "red"]);

    this.selectionArea = selectionArea;
    this.areaSearch = d3.select("#" + areaSearch);
    this.filterParent = d3.select("#" + filterParent);

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

        vis.toggleWidth = document.getElementById(vis.selectionArea).getBoundingClientRect().width - 20;
        vis.toggleHeight = document.getElementById(vis.selectionArea).getBoundingClientRect().height - 20;
        vis.selectionSVG = d3.select("#" + vis.selectionArea).append("svg")
        	.attr("width", vis.toggleWidth + 20)
			.attr("height", vis.toggleHeight + 20)
			.append("g")
			.attr("transform", "translate(" + 10 + "," + 10 + ")");
        vis.toggleX = d3.scaleLinear()
			      .range([0, vis.toggleWidth])

		vis.toggleY = d3.scaleLinear()
                  .range([vis.toggleHeight, 0])

		vis.toggleXAxis = d3.axisBottom()
			          .scale(vis.toggleX);

		vis.toggleYAxis = d3.axisLeft()
			          .scale(vis.toggleY)

		vis.selectionSVG.append("g")
			   .attr("class", "x-axis axis")
			   .attr("transform", "translate(0," + vis.toggleHeight + ")");

		vis.selectionSVG.append("g")
			   .attr("class", "y-axis axis")

        // create a tooltip
        vis.tooltip = d3.select("body")
            .append("div")
            .style("opacity", 1)
            .attr("class", "tooltip")
            .style("background-color", "white")
            .style("border", "solid")
            .style("border-width", "2px")
            .style("border-radius", "5px")
            .style("padding", "5px")
            .style("position", "absolute")
            .style("color", "black")
        vis.defs = vis.svg.append("defs");

        const parent = d3.select("#vis5-city-filter");

        // Create a dropdown container (shown when input is focused)
        vis.dropdown = parent.append("div")
                             .attr("id", "vis5-area-dropdown")
                             .style("position", "absolute")
                             .style("top", "65px")
                             .style("left", "10px")
                             .style("width", "calc(100% - 20px)")
                             .style("background", "white")
                             .style("border", "1px solid #ccc")
                             .style("border-radius", "4px")
                             .style("max-height", "250px")
                             .style("overflow-y", "auto")
                             .style("display", "none")
                             .style("z-index", "1000")
                             .style("box-shadow", "0 2px 6px rgba(0,0,0,0.15)");

        vis.createAreaFilters();

        vis.wrangleData();
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
            return a.category.localeCompare(b.category)
        })

        let categories = [];
        
        // final average calculation
        accumulatedData.forEach((e, i) =>   {
            e.avg /= e.cityNum

            // 2001 is the first year in the dataset, so exclude the change
            // For some reason Parksville has 0 in rent for 2001 which i somehow doubt is correct, so this is the bandaid fix
            if (e.year == "2001" || (e.category == "Parksville" && e.year == "2002")) {
                e.popChange = 0;
                e.avgChange = 0;
            }   else    {
                e.popChange = (e.pop - accumulatedData[i - 1].pop) / (accumulatedData[i - 1].pop) * 100
                e.avgChange = (e.avg - accumulatedData[i - 1].avg) / accumulatedData[i - 1].avg * 100;
            }

            if (e.year == "2001")   {
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

    populateDropdown(list) {
        let vis = this;
        vis.dropdown.selectAll("div").remove();
        vis.dropdown.selectAll("div")
            .data(list)
            .enter()
            .append("div")
            .text(d => d)
            .style("padding", "6px 8px")
            .style("cursor", "pointer")
            .on("click", function(event, d) {
                vis.dropdown.style("display", "none");

                vis.toggleLocation(d);
            })
            .on("mouseover", function() {
                d3.select(this).style("background", "#eee");
            })
            .on("mouseout", function() {
                d3.select(this).style("background", "white");
            });
    }

    toggleLocation(loc) {
        let vis = this;
        if (Object.keys(vis.cityFilter).includes(loc))  {
            vis.cityFilter[loc].self = !vis.cityFilter[loc].self;
        }   else    {
            vis.cityFilter[vis.cityProvinceMap[loc.toLowerCase()]][loc] = !vis.cityFilter[vis.cityProvinceMap[loc.toLowerCase()]][loc];
        }
        vis.wrangleData();
    }

    createToggleDivs()  {
        let vis = this;

        let toggled = []
        Object.keys(vis.cityFilter).forEach((p) =>    {
            Object.keys(vis.cityFilter[p]).forEach((c) => {
                if (vis.cityFilter[p][c])   {
                    if (c == "self")    {
                        toggled.push({"loc": p, i: toggled.length});
                    }   else     {
                        toggled.push({"loc": c, i: toggled.length});
                    }
                }
            })
        })

        const NUM_LOCS = 145
        const NUM_COLS = 8;
        const NUM_ROWS = Math.ceil(NUM_LOCS / 40)

        let boxWidth = vis.toggleWidth / NUM_COLS - 20;
        let boxHeight = vis.toggleHeight / NUM_ROWS - 20;
        
        vis.toggleX.domain([0, NUM_COLS]);
        vis.toggleY.domain([NUM_ROWS, 0])

        let groups = vis.selectionSVG.selectAll(".toggle-group")
    .data(toggled, d => d.i);

    groups.join(
        enter => {
            let g = enter.append("g")
                .attr("class", "toggle-group")
                .on("mouseover", function (event, d) {
                    d3.select(this).select("rect").style("fill", "#ff8686ff");
                })
                .on("mouseout", function (event, d) {
                    d3.select(this).select("rect").style("fill", "#90EE90");
                })
                .on("click", function (event, d) {
                    console.log(d.loc);
                    vis.toggleLocation(d.loc);
                });

            g.append("rect")
                .attr("width", boxWidth)
                .attr("height", boxHeight)
                .attr("x", d => vis.toggleX(d.i % NUM_COLS))
                .attr("y", d => vis.toggleY(Math.floor(d.i / NUM_COLS)))
                .style("fill", "#90EE90");

            g.append("text")
                .attr("x", d => vis.toggleX(d.i % NUM_COLS) + boxWidth / 2)
                .attr("y", d => vis.toggleY(Math.floor(d.i / NUM_COLS)) + boxHeight / 1.6)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("font-size", Math.min(boxHeight * 0.5, boxWidth * 0.2)) // adaptive font size
                .text(d => d.loc);

            return g;
        },
        update => {
            update.select("rect")
                .attr("x", d => vis.toggleX(d.i % NUM_COLS))
                .attr("y", d => vis.toggleY(Math.floor(d.i / NUM_COLS)));

            update.select("text")
                .attr("x", d => vis.toggleX(d.i % NUM_COLS) + boxWidth / 2)
                .attr("y", d => vis.toggleY(Math.floor(d.i / NUM_COLS)) + boxHeight / 1.6)
                .text(d => d.loc);

            return update;
        },
        exit => exit.remove()
    );
}

    createAreaFilters()    {
        let vis = this;

        let categories = [];
        Object.keys(vis.cityFilter).forEach(p => {
            categories.push(p);
            Object.keys(vis.cityFilter[p]).forEach(c => {
                if (c != "self")    {
                    categories.push(c);
                }
            });
        });

        // Show dropdown on focus
        vis.areaSearch.on("focus", () => {
            vis.populateDropdown(categories);
            vis.dropdown.style("display", "block");
        });

        // Filter dropdown as user types
        vis.areaSearch.on("input", () => {
            const query = vis.areaSearch.property("value").toLowerCase();

            const filtered = categories.filter(function (d) {

                if (d.toLowerCase().includes(query))    {
                    return true;
                }   
                let provinceQuery = vis.cityProvinceMap[d.toLowerCase()]
                if (provinceQuery != undefined && provinceQuery.toLowerCase().includes(query))    {
                    return true;
                }

                return false;
            });
            vis.populateDropdown(filtered);
            vis.dropdown.style("display", filtered.length ? "block" : "none");
        });

        // Hide dropdown when clicking outside
        d3.select("body").on("click", (event) => {
            if (!event.target.closest("#vis5-city-filter")) {
                vis.dropdown.style("display", "none");
            }
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

	/*
	 * The drawing function - should use the D3 update sequence (enter, update, exit)
 	* Function parameters only needed if different kinds of updates are needed
 	*/
	updateVis(){
		let vis = this;
        vis.x.domain([...new Set(vis.displayData.map(item => item.year))]);
        vis.y.domain(vis.displayCategories)
        vis.popColorScale.domain([d3.min(vis.displayData, d => d.popChange),
                               d3.median(vis.displayData, d => d.popChange),
                               d3.max(vis.displayData, d => d.popChange)
        ])
        vis.avgColorScale.domain([d3.min(vis.displayData, d => d.avgChange),
                               d3.median(vis.displayData, d => d.avgChange),
                               d3.max(vis.displayData, d => d.avgChange)
        ])

        vis.createToggleDivs();

        // build gradients
        vis.displayData.forEach(d => {
            const gradId = `grad-${d.year}-${d.category.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            
            let gradient = vis.defs.append("linearGradient")
                .attr("id", gradId)
                .attr("x1", "0%")
                .attr("y1", "0%")
                .attr("x2", "100%")
                .attr("y2", "100%");
            
            gradient.append("stop")
                .attr("offset", "0%")
                .attr("stop-color", vis.avgColorScale(d.avgChange));
            
            gradient.append("stop")
                .attr("offset", "100%")
                .attr("stop-color", vis.popColorScale(d.popChange));
        });

        let boxes = vis.svg.selectAll("rect")
                       .data(vis.displayData)

        boxes.enter().append("rect")    
                     .merge(boxes)
                     .on("mouseover", function(d)   {
                        d3.select(this)
                          .style("stroke", "black")
                          .style("stroke-width", 1)
                        vis.tooltip.style("opacity", 1)
                     })
                     .on("mouseleave", function(d)   {
                        d3.select(this)
                          .style("stroke-width", 0)
                        vis.tooltip.style("opacity", 0)
                     })
                     .on("mousemove", function(e, d)   {
                        const [x, y] = d3.pointer(e);
                        vis.tooltip
                            .style("left", (e.pageX + 10) + "px")
                            .style("top", (e.pageY + 10) + "px")
                            .html(`
                            <strong>${d.category}</strong><br/>
                            Year: ${d.year}<br/>
                            Change in Rent Since: ${d.avgChange.toFixed(2)}%<br/>
                            Change in Population: ${d.popChange.toFixed(2)}%
                            `);
                     })
                     .transition(750)
                     .attr("width", vis.x.bandwidth())
                     .attr("height", vis.y.bandwidth())
                     .attr("x", d => vis.x(d.year))
                     .attr("y", d => vis.y(d.category))
                     .style("fill", d => `url(#grad-${d.year}-${d.category.replace(/[^a-zA-Z0-9_-]/g, "_")})`)
        boxes.exit().remove();  

		// Call axis functions with the new domain
		vis.svg.select(".x-axis").call(vis.xAxis);
        vis.svg.select(".y-axis").call(vis.yAxis);
	}
}