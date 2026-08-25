/**
 * A verbatim copy of the script published at:
 * https://liferay.atlassian.net/wiki/spaces/ENGAC/pages/5290819624
 *
 * It lives here so the harness has something to load. Change the page
 * first, then re-copy: the page is the source of truth, this is not.
 */

(function () {
	var FIELD_MAP = {
		Company: 'accountName',
		Country: 'country',
		Email: 'emailAddress',
		FirstName: 'firstName',
		LastName: 'lastName'
	};

	var FORM_ID = null;

	if (typeof MktoForms2 === 'undefined') {
		return;
	}

	function getFields(values) {
		return Object.keys(FIELD_MAP)
			.map(function (marketoName) {
				return {
					name: FIELD_MAP[marketoName],
					value: String(values[marketoName] || '').trim()
				};
			})
			.filter(function (field) {
				return field.value;
			})
			.sort(function (fieldA, fieldB) {
				if (fieldA.name === fieldB.name) {
					return 0;
				}

				return fieldA.name < fieldB.name ? -1 : 1;
			});
	}

	MktoForms2.whenReady(function (form) {
		if (FORM_ID !== null && form.getId() !== FORM_ID) {
			return;
		}

		form.onSuccess(function (values, followUpUrl) {
			function go() {
				location.href = followUpUrl;
			}

			if (typeof Analytics === 'undefined') {
				go();

				return false;
			}

			Analytics.setIdentity({
				fields: getFields(values)
			});

			if (typeof Analytics.flush !== 'function') {
				go();

				return false;
			}

			Analytics.flush()
				.catch(function () {})
				.finally(go);

			return false;
		});
	});
})();
