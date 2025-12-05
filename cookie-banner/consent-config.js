(() => {
  // Shared consent banner initialization for all pages
  const dataLayer = (window.dataLayer = window.dataLayer || []);
  const gtag = (window.gtag =
    window.gtag ||
    function () {
      dataLayer.push(arguments);
    });

  const cookieBannerConfig = {
    background: { showBackground: true },
    cookieIcon: { position: 'bottomLeft' },
    cookieTypes: [
      {
        id: 'necessary',
        name: 'Välttämättömät',
        description:
          '<p>Nämä evästeet ovat välttämättömiä sivuston toiminnalle eikä niitä voi kytkeä pois. Ne auttavat esimerkiksi kirjautumisessa ja yksityisyysasetusten tallentamisessa.</p>',
        required: true,
        onAccept: function () {},
      },
      {
        id: 'analytics',
        name: 'Analytiikka',
        description:
          '<p>Nämä evästeet auttavat kehittämään sivua seuraamalla, mitkä sivut ovat suosituimpia ja miten kävijät liikkuvat sivustolla.</p>',
        defaultValue: true,
        onAccept: function () {
          gtag('consent', 'update', { analytics_storage: 'granted' });
          dataLayer.push({ event: 'consent_accepted_analytics' });
        },
        onReject: function () {
          gtag('consent', 'update', { analytics_storage: 'denied' });
        },
      },
      {
        id: 'advertising',
        name: 'Mainonta',
        description:
          '<p>Nämä evästeet tuovat lisäominaisuuksia ja personointia. Ne voivat olla meidän tai kumppaniemme asettamia.</p>',
        defaultValue: true,
        onAccept: function () {
          gtag('consent', 'update', {
            ad_storage: 'granted',
            ad_user_data: 'granted',
            ad_personalization: 'granted',
          });
          dataLayer.push({ event: 'consent_accepted_advertising' });
        },
        onReject: function () {
          gtag('consent', 'update', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
          });
        },
      },
    ],
    text: {
      banner: {
        description:
          '<p>Käytämme evästeitä käyttökokemuksen parantamiseen, sisällön personointiin ja kävijätilastointiin. <a href="/privacy.html" target="_blank">Lue evästekäytännöstämme</a>.</p>',
        acceptAllButtonText: 'Hyväksy kaikki',
        acceptAllButtonAccessibleLabel: 'Hyväksy kaikki evästeet',
        rejectNonEssentialButtonText: 'Hylkää',
        rejectNonEssentialButtonAccessibleLabel: 'Hylkää ei-välttämättömät evästeet',
        preferencesButtonText: 'Evästeasetukset',
        preferencesButtonAccessibleLabel: 'Avaa evästeasetukset',
      },
      preferences: {
        title: 'Evästeasetukset',
        description:
          '<p>Kunnioitamme yksityisyyttäsi. Voit kieltää tietyt evästetyypit. Valintasi koskevat koko sivustoa. <a href="/privacy.html" target="_blank">Lue evästekäytännöstämme</a>.</p>',
        saveButtonText: 'Tallenna valinnat',
        saveButtonAccessibleLabel: 'Tallenna nykyiset evästevalinnat',
        creditLinkText: '',
        creditLinkAccessibleLabel: '',
      },
    },
  };

  function applyDefaultConsent() {
    gtag('consent', 'default', {
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_personalization: 'granted',
      ad_user_data: 'granted',
    });
  }

  window.initConsentBanner = function initConsentBanner() {
    applyDefaultConsent();
    silktideCookieBannerManager.updateCookieBannerConfig(cookieBannerConfig);
  };
})();
