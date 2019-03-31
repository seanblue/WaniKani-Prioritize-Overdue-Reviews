const randomItemsToInclude = 0.25;

function randomlyAddNotOverdueItems(overdueQueue, notOverdueQueue) {
	let randomNumberOfNotOverdueItemsToInsert = Math.min(Math.ceil(randomItemsToInclude * overdueQueue.length), notOverdueQueue.length);

	for (let i = 0; i < randomNumberOfNotOverdueItemsToInsert; i++) {
		let randomIndex = getRandomArrayIndex(overdueQueue.length + 1);
		overdueQueue.splice(randomIndex, 0, notOverdueQueue[0]);
		notOverdueQueue.splice(0, 1);
	}
}

function getRandomArrayIndex(arraySize) {
  return Math.floor(Math.random() * arraySize);
}

function run() {
    let runs = 1000000;
    let startingLength = 16;
    let additionalItems = Math.ceil(startingLength * randomItemsToInclude);
    let aCount = new Array(startingLength + additionalItems).fill(0);
    
    for (let i = 0; i < runs; i++) {
        let overdueQueue = new Array(startingLength).fill('a');
        let notOverdueQueue = new Array(startingLength).fill('b');
        
        randomlyAddNotOverdueItems(overdueQueue, notOverdueQueue);
        
        for (let j = 0; j < overdueQueue.length; j++) {
            if (overdueQueue[j] === 'a') {
                aCount[j]++;
            }
        }
    }
    
    let percentCounts = aCount.map(item => item / runs);
    console.log(percentCounts);
}

run();