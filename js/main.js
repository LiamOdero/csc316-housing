
// Start application by loading the data
loadData();

function loadData() {
    d3.csv("data/avg_rent_by_pop.csv"). then(data=>{
        cleaned_data = preparePopRentData(data);
        let popChart = new PopulationRentChart("vis5", ["RA3P", "R3P", "A3P", "A6P", "bachelor", "onebed", "twobed", "threebed"], 
                                               "provinceSelect", "city-list", cleaned_data)

        popChart.initVis();
    })

    // Load and create the building visualization
    d3.json('data/vacancy_data.json').then(data => {
        createBuildingVisualization(data);
    }).catch(error => {
        console.error('Error loading data:', error);
        document.getElementById('buildings-container').innerHTML =
            '<p style="color: #ff6b6b; text-align: center;">Error loading visualization data.</p>';
    });
}

function preparePopRentData(data){
    cleaned_data = []

    data.forEach(e => {
        let loc = e.GEO;

        let index = loc.indexOf(",");
        let city = loc.slice(0, index);
        let dataObj = {structure: e["Type of structure"], unit: e["Type of unit"], avg: +e.VALUE}

        if (cleaned_data.length > 0 && cleaned_data[cleaned_data.length - 1].city == city) {
            cleaned_data[cleaned_data.length - 1].data.push(dataObj)
        }   else    {
            let province = loc.slice(index + 2);
            let locObj = {year: e.REF_DATE, city: city, province: province, pop: +e.POP, data: [dataObj]};
            cleaned_data.push(locObj)
        }        
    });
    return cleaned_data;
}