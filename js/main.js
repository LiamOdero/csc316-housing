
// Start application by loading the data
loadData();

function loadData() {
    // Load and create the building visualization
    d3.json('data/vacancy_data.json').then(data => {
        createBuildingVisualization(data);
    }).catch(error => {
        console.error('Error loading data:', error);
        document.getElementById('buildings-container').innerHTML =
            '<p style="color: #ff6b6b; text-align: center;">Error loading visualization data.</p>';
    });
}

function prepareData(data){

}