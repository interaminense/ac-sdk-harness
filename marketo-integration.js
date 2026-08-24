/**
 * A verbatim copy of the script published at:
 * https://liferay.atlassian.net/wiki/spaces/ENGAC/pages/5290819624
 *
 * It lives here so the harness has something to load. Change the page
 * first, then re-copy: the page is the source of truth, this is not.
 */

(function () {

	// Marketo field name on the left, the Analytics Cloud Individual column it
	// fills on the right. Add a row for any other field you collect; anything
	// not listed here is left out of the payload.

	var FIELD_MAP = {
		Company: 'accountName',
		Country: 'country',
		Email: 'emailAddress',
		FirstName: 'firstName',
		LastName: 'lastName'
	};

	// Set this to a Marketo form id to track only that form. Leave it null to
	// track every Marketo form on the page.

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

			// The client is not on the page. That is normal when a consent
			// banner has not been accepted yet, and it must never stop the
			// visitor from reaching the follow-up page.

			if (typeof Analytics === 'undefined') {
				go();

				return false;
			}

			Analytics.setIdentity({

				// The email travels twice on purpose. At the top level the
				// client hashes it into the anchor the backend identifies the
				// Individual by; inside fields it stays in plaintext, which is
				// what fills the Individual's own column. The hash is one way,
				// so one cannot be derived from the other.

				email: String(values.Email || '').trim(),
				fields: getFields(values)
			});

			if (typeof Analytics.flush !== 'function') {
				go();

				return false;
			}

			// The catch is not redundant: finally() passes a rejection through
			// rather than swallowing it, so without it a failed send would
			// surface as an unhandled rejection on your page.

			Analytics.flush()
				.catch(function () {})
				.finally(go);

			// Returning false is what stops Marketo from redirecting on its
			// own, so that the redirect above is the only one that happens.

			return false;
		});
	});
})();
