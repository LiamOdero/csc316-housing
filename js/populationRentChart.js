
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
constructor(parentElement, filterElements, data) {
    this.parentElement = parentElement;

    // sorting the data to make accumulation logic simpler
    this.data = data.sort(function(a, b)    {
        return a.year - b.year || a.province.localeCompare(b.province)
    })

    this.displayData = [];

    let colors = ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a'];

    this.provinces = [...new Set(data.map(item => item.province))];
    this.displayCategories = this.provinces
    this.displayKeys = []

    this.provinceMode = true;

    // Constructing an object mapping provinces to the cities they contain
    this.cities = this.provinces.reduce((acc, province) => {
                        acc[province] = [];
                        return acc;
                    }, {});

    this.data.forEach(e => {
        this.cities[e.province].push(e.city)
    });

    this.provinces.forEach(e => {
        this.cities[e] = [...new Set(this.cities[e])];
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
        this.createListener(e)
    })
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
        })

        if (vis.provinceMode)   {
            // Accumulate city data by province and average it out

            let provinceData = [];

            newData.forEach(e =>    {
                // accumulating averages across cities
                if(provinceData.length > 0 && provinceData[provinceData.length - 1].province == e.province)    {
                    
                    provinceData[provinceData.length - 1].pop += e.pop;
                    provinceData[provinceData.length - 1].avg += e.avg;
                    provinceData[provinceData.length - 1].cityNum += 1;
                }   else    {
                    let currObj = {province: e.province, year: e.year, pop: e.pop, avg: e.avg, cityNum: 1}
                    provinceData.push(currObj)
                }
            })
            
            provinceData = provinceData.sort(function(a, b) {
                return a.province.localeCompare(b.province)
            })
            // final average calculation
            provinceData.forEach((e, i) =>   {
                e.avg /= e.cityNum

                // 2001 is the first year in the dataset, so exclude the change
                e.popChange = (e.year != "2001") ? (e.pop - provinceData[i - 1].pop) / e.pop * 100: 0;
                e.avgChange = (e.year != "2001") ? (e.avg - provinceData[i - 1].avg) / e.avg * 100: 0;
            })

            this.displayKeys = []
            let max = d3.extent(provinceData, d => d.popChange)[1]
            for (let i = 0; i < NUM_CATEGORIES; i++)    {
                this.displayKeys.push(max / NUM_CATEGORIES * (i + 1))
            }
            vis.displayData = provinceData;
        }   else    {
            // TODO: cities
        }
        this.accumulateCategories();
    }

    accumulateCategories()  {
        // Bins the current display data by $ population change
        let vis = this;
        let binnedData = [];
        vis.displayKeys.forEach((e, i) => {
            let currObj = {};

            let lowerCompare = (i > 0) ? vis.displayKeys[i - 1] : 0;
            let higherCompare = vis.displayKeys[i]

            // very inefficient way to collect the data, will optimize
            vis.provinces.forEach(e => {
                let total = 0;
                let currAvg = 0;
                let currProvince = e;
                vis.displayData.forEach(e =>   {
                    
                    if (e.province == currProvince && e.popChange > lowerCompare && e.popChange <= higherCompare)   {
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
        vis.provinceMode = !vis.provinceMode;

        if (vis.provinceMode)   {

        }   else    {

        }

        vis.wrangleData();
    }

    createListener(checkbox)    {
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
        console.log(this.displayKeys)

		// Draw the layers
		let categories = vis.svg.selectAll(".area")
			.data(vis.stackedData);
		
		categories.enter().append("path")
			.on("mouseover", function(e, d)	{
                vis.tooltip.text(d.key)
			})
			.on("click", function(e, d)	{
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