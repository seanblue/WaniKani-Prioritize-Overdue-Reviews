function shuffle(array) {
  var m = array.length, t, i;

  // While there remain elements to shuffle…
  while (m) {

    // Pick a remaining element…
    i = Math.floor(Math.random() * m--);

    // And swap it with the current element.
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }

  return array;
}

function run() {
    let runs = 1000000;
    let startingLength = 10;
    let counts = new Array(startingLength).fill().map(() => new Array(startingLength).fill(0));
    
    for (let i = 0; i < runs; i++) {
        let array = new Array(startingLength).fill().map((x, i) =>  i);
        
        shuffle(array);
        
        for (let j = 0; j < array.length; j++) {
            counts[array[j]][j]++;
        }
    }
    
    let percentCounts = counts.map(row => row.map(item => item / runs));
    console.log(percentCounts);
}

run();