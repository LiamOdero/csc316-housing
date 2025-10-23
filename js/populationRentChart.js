
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
constructor(parentElement, filterElements, provinceSelect, provinceFilterArea, data) {
    this.parentElement = parentElement;

    // sorting the data to make accumulation logic simpler
    this.data = data.sort(function(a, b)    {
        return a.year - b.year || a.province.localeCompare(b.province)
    })

    this.displayData = [];

    let colors = ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a'];

    // A list of all provinces in the dataset
    this.provinces = [...new Set(data.map(item => item.province))];

    // Has all cities / provinces currently displayed in the chart
    this.displayCategories = this.provinces

    // Contains all bins of % increases over the x axis
    this.displayKeys = []

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
        let currObj = {cityMode: false};
        let provivince = e;
        citySet.forEach(e =>    {
            currObj[e] = true;
            vis.cityProvinceMap[e] = provivince;
        })
        this.cityFilter[e] = currObj;
    })

    // prepare colors for range
    let colorArray = this.displayCategories.map( (d,i) => {
        return colors[i%10]
    })

    // Set ordinal color scale
    this.colorScale = d3.scaleOrdinal()
        .domain(this.displayCategories)
        .range(colorArray);

    this.structureIDMap = {RA3P: "Row and apartment structures of three units and over", 
                          R3P: "Row structures of three units and over", 
                          A3P: "Apartment structures of three units and over", 
                          A6P: "Apartment structures of six units and over"};
    this.structureFilters = data[1].data.reduce((acc, e) => {
                                acc[e.structure] = true;
                                return acc;
                            }, {});

    this.unitIDMap = {bachelor: "Bachelor units", onebed: "One bedroom units", twobed: "Two bedroom units", threebed: "Three bedroom units"};
    this.unitFilters = data[3].data.reduce((acc, e) => {
                                acc[e.unit] = true;
                                return acc;
                            }, {});

    filterElements.forEach(e => {
        this.createBuildingListeners(e)
    })

    // Listener for province selection
    this.provinceFilterArea = d3.select("#" + provinceFilterArea);
    this.select = d3.select("#" + provinceSelect);
    this.select.on("change", function() {
        vis.createProvinceFilters(vis.select.property("value"));
    });
    this.createProvinceFilters(vis.select.property("value"));
}

	/*
	 * Method that initializes the visualization (static content, e.g. SVG area or axes)
 	*/
	initVis(){
		let vis = this;

		vis.margin = {top: 200, right: 200, bottom: 60, left: 40};

		vis.width = document.getElementById(vis.parentElement).getBoundingClientRect().width - vis.margin.left - vis.margin.right;
		vis.height = document.getElementById(vis.parentElement).getBoundingClientRect().height - vis.margin.top - vis.margin.bottom;

		// SVG drawing area
		vis.svg = d3.select("#" + vis.parentElement).append("svg")
			.attr("width", vis.width + vis.margin.left + vis.margin.right)
			.attr("height", vis.height + vis.margin.top + vis.margin.bottom)
			.append("g")
			.attr("transform", "translate(" + vis.margin.left + "," + vis.margin.top + ")");

		// Scales and axes
		vis.x = d3.scaleLinear()
			.range([0, vis.width]);

		vis.y = d3.scaleLinear()
			.range([vis.height, 0]);

		vis.xAxis = d3.axisBottom()
			.scale(vis.x);

		vis.yAxis = d3.axisLeft()
			.scale(vis.y);

		vis.svg.append("g")
			.attr("class", "x-axis axis")
			.attr("transform", "translate(0," + vis.height + ")");

		vis.svg.append("g")
			.attr("class", "y-axis axis");

		vis.tooltip = vis.svg.append("text")
					  .attr("x", 0)
					  .attr("y", 0)

         vis.wrangleData();

	}

    // Accumulates averages over the current displayCategory
    accumulateAvg() {
        let vis = this;
        let newData = [];

        // Collecting yearly averages across selected structure and unit types
        this.data.forEach(e =>  {
            let accAvg = 0;
            let num = 0;
            
            let include = vis.cityFilter[e.province][e.city];
                if (include)    {
                e.data.forEach(e => {
                    let include = vis.structureFilters[e.structure] && vis.unitFilters[e.unit]
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

        newData.forEach((e, i) =>    {
            // accumulating averages across cities
            let currCategory = (vis.cityFilter[e.province].cityMode) ? e.city : e.province
            if (accumulatedData.length == 0 || vis.cityFilter[e.province].cityMode || (accumulatedData[accumulatedData.length - 1].category != currCategory) || (accumulatedData[accumulatedData.length - 1].year!= e.year) )  {
                // Directly push an object in one of 4 cases: No other object in accumulated data, the current province is displaying each city,
                // or none of the above BUT the province or year have changed
                
                let currObj = {category: currCategory, year: e.year, pop: e.pop, avg: e.avg, cityNum: 1}
                accumulatedData.push(currObj)
            }   else    {
                // only accumulate if there is data, the province is the same and in the same year, and we arent displaying individual cities
                accumulatedData[accumulatedData.length - 1].pop += e.pop;
                accumulatedData[accumulatedData.length - 1].avg += e.avg;
                accumulatedData[accumulatedData.length - 1].cityNum += 1;
            }

        })
            
        accumulatedData = accumulatedData.sort(function(a, b) {
            return a.category.localeCompare(b.category)
        })

        let categories = [];
        
        let startAvg = 0;
        let startPop = 0;

        // final average calculation
        accumulatedData.forEach((e, i) =>   {
            e.avg /= e.cityNum

            // 2001 is the first year in the dataset, so exclude the change
            // For some reason Parksville has 0 in rent for 2001 which i somehow doubt is correct, so this is the bandaid fix
            if (e.year == "2001" || (e.category == "Parksville" && e.year == "2002")) {
                startAvg = e.avg;
                startPop = e.pop;

                e.popChange = 0;
                e.avgChange = 0;
            }   else    {
                e.popChange = (e.pop - startPop) / (startPop) * 100
                e.avgChange = (e.avg - startAvg) / startAvg * 100;
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
        vis.displayData = accumulatedData;
        console.log(accumulatedData)
        this.accumulateCategories();
    }

    accumulateCategories()  {
        // Bins the current display data by % population change
        let vis = this;
        let binnedData = [];
        let range = d3.extent(vis.displayData, d => d.popChange)
        vis.displayKeys.forEach((e, i) => {
            let currObj = {};

            let lowerCompare = (i > 0) ? vis.displayKeys[i - 1] : range[0];
            let higherCompare = vis.displayKeys[i]

            // very inefficient way to collect the data, will optimize
            vis.displayCategories.forEach(e => {
                let total = 0;
                let currAvg = 0;
                let currProvince = e;
                vis.displayData.forEach(e =>   {
                    
                    if (e.category == currProvince && e.popChange > lowerCompare && e.popChange <= higherCompare)   {
                        currAvg += e.avgChange;
                        total += 1;
                    }
                })

                currAvg /= (total > 0) ? total : 1;
                currObj[e] = currAvg
            });
            binnedData.push(currObj);
        })
        vis.stackData = binnedData;

    }

    handleClick(d)   {
        let vis = this;
        let category = d.key;
        if (vis.provinces.includes(category))   {
            // clicked on a province
            vis.provinces.forEach(e =>  {
                let currProvince = e;
                if (e != category)  {
                    Object.keys(vis.cityFilter[currProvince]).forEach(e => {
                        vis.cityFilter[currProvince][e] = false;
                    })
                }   else    {
                    vis.cityFilter[e].cityMode = true;
                }

            })
            vis.select.property("value", category);
            this.createProvinceFilters(category)
            
        }   else    {
            //clicked on a city
            let province = vis.cityProvinceMap[category];
            vis.cityFilter[province].cityMode = false;
        }

        vis.wrangleData();
    }

    createBuildingListeners(checkbox)    {
        let vis = this;
        let check = d3.select("#" + checkbox)
        check.property("checked", true)
        
        check.on("change", function(d)  {
            if (checkbox.length < 5)    {
                
                vis.structureFilters[vis.structureIDMap[checkbox]] = this.checked;
            }   else    {
                vis.unitFilters[vis.unitIDMap[checkbox]] = this.checked;
            }
            vis.wrangleData();
        })
    }
    
    createProvinceFilters(province)    {
        let vis = this;
        let cities = ["All " + province];
        let allCheckPre = true;
        Object.keys(vis.cityFilter[province]).forEach(e =>   {
            if (e != "cityMode")    {
                cities.push(e)
                allCheckPre = allCheckPre && vis.cityFilter[province][e];
            }
        })

        let citySelection = vis.provinceFilterArea.selectAll(".city-checkbox")
                                           .data(cities, d => d);
        citySelection.exit()
            .transition()
            .duration(200)
            .style("opacity", 0)
            .remove();

        let cityEnter = citySelection.enter()
            .append("div")
            .attr("class", "form-check city-checkbox")
            .style("opacity", 0);

        cityEnter.append("input")
            .attr("class", "form-check-input")
            .attr("type", "checkbox")
            .attr("id", d => `check-${d.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
            .attr("value", d => d)
            .property("checked", function(d)    {
                if (d.slice(0, 3) == "All") {
                    return allCheckPre;
                }   else    {
                    return vis.cityFilter[province][d]
                }
            })
            .on("change", function(d)   {
                let target = d.target.value
                if (target.slice(0, 3) == "All")    {
                    let allCheck = d.target.checked;
                    cities.forEach(e => {
                        if (e.slice(0, 3) != "All") {
                            vis.cityFilter[province][e] = allCheck;

                            d3.select(`#check-${e.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
                                    .property("checked", allCheck);
                        }
                    })
                }   else    {
                    vis.cityFilter[province][target] = !vis.cityFilter[province][target];
                }
                vis.wrangleData();
            });


        cityEnter.append("label")
            .attr("class", "form-check-label")
            .attr("for", d => `check-${d}`)
            .text(function(d)  {
                if (d.slice(0, 3) == "All") {
                    return "All";
                }   else    {
                    return d;
                }
            });

        // ENTER + UPDATE MERGE
        cityEnter.merge(citySelection)
            .transition()
            .duration(200)
            .style("opacity", 1);
            }

	/*
 	* Data wrangling
 	*/
	wrangleData(){
		let vis = this;
        vis.accumulateAvg();
        let stack = d3.stack()
            .keys(vis.displayCategories)
            .offset(d3.stackOffsetNone);
        vis.stackedData = stack(vis.stackData);

        vis.area = d3.area()	
			.curve(d3.curveCardinal)
			.x((d, i)=> vis.x(vis.displayKeys[i]))
			.y0(d=> vis.y(d[0]))
			.y1(d=>vis.y(d[1]))


		vis.updateVis();
	}

	/*
	 * The drawing function - should use the D3 update sequence (enter, update, exit)
 	* Function parameters only needed if different kinds of updates are needed
 	*/
	updateVis(){
		let vis = this;

        vis.x.domain(d3.extent(vis.displayKeys));
        vis.y.domain([
        d3.min(vis.stackedData, layer => d3.min(layer, d => d[0])),
        d3.max(vis.stackedData, layer => d3.max(layer, d => d[1]))
        ]);

		// Draw the layers
		let categories = vis.svg.selectAll(".area")
			.data(vis.stackedData);
		
		categories.enter().append("path")
			.on("mouseover", function(e, d)	{
                vis.tooltip.text(d.key)
			})
			.on("click", function(e, d)	{
                vis.handleClick(d)
			})

			.attr("class", "area")
			.merge(categories)
            .transition(750)
			.style("fill", d => {
				return vis.colorScale(d)
			})
			.attr("d", d => vis.area(d))

		categories.exit().remove();
                                

		// Call axis functions with the new domain
		vis.svg.select(".x-axis").call(vis.xAxis);
		vis.svg.select(".y-axis").call(vis.yAxis);
	}
}