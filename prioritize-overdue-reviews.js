// ==UserScript==
// @name          WaniKani Prioritize Overdue Reviews
// @namespace     https://www.wanikani.com
// @description   Prioritize review items that are more overdue based on their SRS level and when the review became available.
// @author        seanblue
// @version       0.9.0
// @include       https://www.wanikani.com/review/session
// @grant         none
// ==/UserScript==

const eventNamespace = '.seanblue.overdue_reviews';

(function($) {$.each(['hide'], function(i, ev) { var el = $.fn[ev]; $.fn[ev] = function() { this.trigger(ev + eventNamespace); return el.apply(this, arguments); }; }); })(window.jQuery);


(function($, wkof) {
	const randomOffset = 0.0;

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
		let stalenessList = items.filter(item => isReviewAvailable(item, now)).map(item => mapToStalenessData(item, now, srsStages)).sort(sortByStaleness);

		window.stalenessList = stalenessList;

		return toStalenessDictionary(stalenessList);
	}

	function isReviewAvailable(item, now) {
		return (item.assignments && (item.assignments.available_at != null) && (new Date(item.assignments.available_at).getTime() < now));
	}

	function mapToStalenessData(item, now, srsStages) {
		let availableAtMs = new Date(item.assignments.available_at).getTime();
		let msSinceAvailable = now - availableAtMs;

		let msForSrsStage = srsStages[item.assignments.srs_stage].interval * 1000;
		let msSinceLastReview = msSinceAvailable + msForSrsStage;
		let staleness = msSinceLastReview / msForSrsStage;

		let adjustedStaleness = staleness * getRandomnessFactor();
		return {
			id: item.id,
			item: item.data.slug,
			srs_stage: item.assignments.srs_stage,
			available_at_time: item.assignments.available_at,
			staleness: adjustedStaleness
		};

		//return item;
	}

	function getRandomnessFactor() {
		let min = 1 - randomOffset;
		let max = 1 + randomOffset;
		return Math.random() * (max - min) + min;
	}

	function sortByStaleness(item1, item2) {
		let stalenessCompare = item1.staleness - item2.staleness;
		if (stalenessCompare > 0) {
			return -1;
		}

		if (stalenessCompare < 0) {
			return 1;
		}

		return item1.id - item2.id;
	}

	function toStalenessDictionary(items) {
		var dict = {};

		for (let i = 0; i < items.length; i++) {
			let item = items[i];
			dict[item.id] = item.staleness;
		}

		return dict;
	}

	function updateReviewQueue(stalenessDictionary) {
		$('div[id*="loading"]:visible').on('hide' + eventNamespace, function() {
			window.stalenessDictionary = stalenessDictionary;

			let unsortedQueue = $.jStorage.get('activeQueue').concat($.jStorage.get('reviewQueue'));
			let queue = unsortedQueue.sort((item1, item2) => sortQueueByStaleness(item1, item2, stalenessDictionary));

			window.queue = queue;

			updateQueueState(queue);
		});
	}


	function sortQueueByStaleness(item1, item2, stalenessDictionary) {
		let stalenessCompare = stalenessDictionary[item1.id] - stalenessDictionary[item2.id];
		if (stalenessCompare > 0) {
			return -1;
		}

		if (stalenessCompare < 0) {
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