// ==UserScript==
// @name          WaniKani Prioritize Overdue Reviews
// @namespace     https://www.wanikani.com
// @description   Prioritize review items that are more overdue based on their SRS level and when the review became available.
// @author        seanblue
// @version       0.9.2
// @include       https://www.wanikani.com/review/session
// @grant         none
// ==/UserScript==

(function($, wkof) {
	const randomOffset = 0.1;

	wkof.include('ItemData');
	wkof.ready('ItemData').then(fetchData);

	function fetchData() {
		let promises = [];
		promises.push(wkof.Apiv2.get_endpoint('srs_stages'));
		promises.push(wkof.ItemData.get_items('assignments'));

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

		let adjustedOverduePercent = overduePercent * getRandomnessFactor();
		return {
			id: item.id,
			item: item.data.slug,
			srs_stage: item.assignments.srs_stage,
			available_at_time: item.assignments.available_at,
			original_overdue_percent: overduePercent,
			overdue_percent: adjustedOverduePercent
		};
	}

	function getRandomnessFactor() {
		let min = 1 - randomOffset;
		let max = 1 + randomOffset;
		return Math.random() * (max - min) + min;
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
		window.overduePercentDictionary = overduePercentDictionary;

		let unsortedQueue = $.jStorage.get('activeQueue').concat($.jStorage.get('reviewQueue'));
		let queue = unsortedQueue.sort((item1, item2) => sortQueueByOverduePercent(item1, item2, overduePercentDictionary));

		window.queue = queue;

		updateQueueState(queue);
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
		let inactiveQueue = queue.slice(batchSize).reverse(); // Items after the active queue are grabbed from the end of the queue.

		$.jStorage.set('activeQueue', activeQueue);
		$.jStorage.set('reviewQueue', inactiveQueue);
		$.jStorage.set('currentItem', activeQueue[0])
	}

})(window.jQuery, window.wkof);