// ==UserScript==
// @name          WaniKani Prioritize Overdue Reviews
// @namespace     https://www.wanikani.com
// @description   Prioritize review items that are more overdue based on their SRS level and when the review became available.
// @author        seanblue
// @version       0.9.7
// @include       https://www.wanikani.com/review/session
// @grant         none
// ==/UserScript==

(function($, wkof) {
	const settingsScriptId = 'prioritizeOverdueReviews';
	const settingsTitle = 'Prioritize Overdue Reviews';

	const shouldSortOverdueItemsKey = 'shouldSortOverdueItems';
	const overdueThresholdPercentKey = 'overdueThresholdPercent';
	const percentRandomItemsToIncludeKey = 'percentRandomItemsToInclude';

	function promise(){var a,b,c=new Promise(function(d,e){a=d;b=e;});c.resolve=a;c.reject=b;return c;}
	let settingsLoadedPromise = promise();

	if (!wkof) {
		var response = confirm('WaniKani Prioritize Overdue Reviews script requires WaniKani Open Framework.\n Click "OK" to be forwarded to installation instructions.');

		if (response) {
			window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549';
		}

		return;
	}

	wkof.include('ItemData, Settings, Menu');
	wkof.ready('Settings, Menu').then(loadSettings);
	wkof.ready('ItemData').then(reorderReviews);

	function loadSettings() {
		wkof.Menu.insert_script_link({ name: settingsScriptId, submenu:'Settings', title: settingsTitle, on_click: openSettings });

		let defaultSettings = {};
		defaultSettings[overdueThresholdPercentKey] = 20;
		defaultSettings[percentRandomItemsToIncludeKey] = 25;
		defaultSettings[shouldSortOverdueItemsKey] = 'random';

		wkof.Settings.load(settingsScriptId, defaultSettings).then(function() {
			settingsLoadedPromise.resolve();
		});

		return settingsLoadedPromise;
	}

	function openSettings() {
		var settings = {};
		settings[overdueThresholdPercentKey] = { type: 'number', label: 'Overdue Threshold', hover_tip: 'test 1' };
		settings[percentRandomItemsToIncludeKey] = { type: 'number', label: 'Randomness Factor', hover_tip: 'test 2' };
		settings[shouldSortOverdueItemsKey] = { type: 'dropdown', label: 'Overdue Item Sorting', content: {'random': 'Random','sorted':'Sorted'}, hover_tip: 'test 3' };

		let settingsDialog = new wkof.Settings({
			script_id: settingsScriptId,
			title: settingsTitle,
			on_save: reorderReviews,
			settings: settings
		});

		settingsDialog.open();
	}

	function reorderReviews() {
		let promises = [];

		promises.push(wkof.Apiv2.get_endpoint('srs_stages'));
		promises.push(wkof.ItemData.get_items('assignments'));
		promises.push(settingsLoadedPromise); // This should go last to not interfere with the data actually returned from the other two promises.

		return Promise.all(promises).then(processData).then(updateReviewQueue);
	}

	function processData(results) {
		let srsStages = results[0];
		let items = results[1];

		let now = new Date().getTime();
		let overduePercentList = items.filter(item => isReviewAvailable(item, now)).map(item => mapToOverduePercentData(item, now, srsStages)).sort(sortByOverduePercent);

		window.overduePercentList = overduePercentList;

		return toOverduePercentDictionary(overduePercentList);
	}

	function isReviewAvailable(item, now) {
		return (item.assignments && (item.assignments.available_at != null) && (new Date(item.assignments.available_at).getTime() < now));
	}

	function mapToOverduePercentData(item, now, srsStages) {
		let availableAtMs = new Date(item.assignments.available_at).getTime();
		let msSinceAvailable = now - availableAtMs;

		let msForSrsStage = srsStages[item.assignments.srs_stage].interval * 1000;
		let msSinceLastReview = msSinceAvailable + msForSrsStage;
		let overduePercent = (msSinceLastReview / msForSrsStage) - 1;

		return {
			id: item.id,
			item: item.data.slug,
			srs_stage: item.assignments.srs_stage,
			available_at_time: item.assignments.available_at,
			overdue_percent: overduePercent
		};
	}

	// TODO: Delete this.
	function sortByOverduePercent(item1, item2) {
		let overduePercentCompare = item1.overdue_percent - item2.overdue_percent;
		if (overduePercentCompare > 0) {
			return -1;
		}

		if (overduePercentCompare < 0) {
			return 1;
		}

		return item1.id - item2.id;
	}

	function toOverduePercentDictionary(items) {
		var dict = {};

		for (let i = 0; i < items.length; i++) {
			let item = items[i];
			dict[item.id] = item.overdue_percent;
		}

		return dict;
	}

	function updateReviewQueue(overduePercentDictionary) {
		let settings = wkof.settings[settingsScriptId];
		let overdueThreshold = Math.max(0, settings[overdueThresholdPercentKey] / 100) || 0;
		let percentRandomItemsToInclude = Math.min(1, Math.max(0, settings[percentRandomItemsToIncludeKey] / 100)) || 0;
		let shouldSortOverdueItems = settings[shouldSortOverdueItemsKey] === 'sorted';

		window.overduePercentDictionary = overduePercentDictionary;

		let reviewQueue = $.jStorage.get('activeQueue').concat($.jStorage.get('reviewQueue'));
		shuffle(reviewQueue); // Need to reshuffle in case the queue has already been sorted.

		let overdueQueue = reviewQueue.filter(item => overduePercentDictionary[item.id] >= overdueThreshold);
		let notOverdueQueue = reviewQueue.filter(item => !overdueQueue.includes(item));

		if (shouldSortOverdueItems) {
			overdueQueue = overdueQueue.sort((item1, item2) => sortQueueByOverduePercent(item1, item2, overduePercentDictionary));
		}

		randomlyAddNotOverdueItems(overdueQueue, notOverdueQueue, percentRandomItemsToInclude);

		let queue = overdueQueue.concat(notOverdueQueue);

		window.queue = queue;

		updateQueueState(queue);
	}

	// Fisher–Yates Shuffle
	function shuffle(array) {
		let m = array.length;

		while (m > 0) {
			let i = Math.floor(Math.random() * m);
			m--;

			let t = array[m];
			array[m] = array[i];
			array[i] = t;
		}

		return array;
	}

	function randomlyAddNotOverdueItems(overdueQueue, notOverdueQueue, percentRandomItemsToInclude) {
		let randomNumberOfNotOverdueItemsToInsert = Math.min(Math.ceil(percentRandomItemsToInclude * overdueQueue.length), notOverdueQueue.length);

		for (let i = 0; i < randomNumberOfNotOverdueItemsToInsert; i++) {
			// Allow equal chance between any existing array index and the end of the array to avoid bias.
			let randomIndex = getRandomArrayIndex(overdueQueue.length + 1);
			overdueQueue.splice(randomIndex, 0, notOverdueQueue[0]);
			notOverdueQueue.splice(0, 1);
		}
	}

	function getRandomArrayIndex(arraySize) {
		return Math.floor(Math.random() * arraySize);
	}

	function sortQueueByOverduePercent(item1, item2, overduePercentDictionary) {
		let overduePercentCompare = overduePercentDictionary[item1.id] - overduePercentDictionary[item2.id];
		if (overduePercentCompare > 0) {
			return -1;
		}

		if (overduePercentCompare < 0) {
			return 1;
		}

		return item1.id - item2.id;
	}

	function updateQueueState(queue) {
		let batchSize = 10;

		let activeQueue = queue.slice(0, batchSize);
		let inactiveQueue = queue.slice(batchSize).reverse(); // Reverse the queue since subsequent items are grabbed from the end of the queue.

		$.jStorage.set('activeQueue', activeQueue);
		$.jStorage.set('reviewQueue', inactiveQueue);
		$.jStorage.set('currentItem', activeQueue[0])
	}

})(window.jQuery, window.wkof);