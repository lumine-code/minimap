// Functions used to recommend the configurations required for the best performance of Minimap

function treeSitterHint() {
  return observeAndHint(
    "language.useTreeSitterParsers",
    true,
    "Tree-sitter is off (low performance).",
    `You should turn on the Tree-sitter parsers to experience the best performance the minimap and Lumine are designed for.
    Keeping the Tree-sitter parsers off results in sluggish scrolling and lags in the text editor.`,
  );
}

/* Utility function that observes a config and hints once a day if it is not the recommended value.
   Nobody asked for this and nothing failed -- it is advice, so it is a hint rather than a warning,
   and it keeps its button because the offer is the whole point of showing it. */
function observeAndHint(configName, recommendedValue, hintTitle, hintDescription) {
  return lumine.config.observe(configName, (value) => {
    if (value !== recommendedValue) {
      const storageName = `Minimap.${configName}`;
      const today = new Date();
      const previousWarning = window.localStorage.getItem(storageName);
      let previousWarningDay = null;
      if (previousWarning) {
        previousWarningDay = new Date(Date.parse(previousWarning)).getDay();
      }
      // throw the hint once a day
      if (
        !previousWarningDay ||
        (typeof previousWarningDay === "number" && previousWarningDay - today.getDay() >= 1)
      ) {
        window.localStorage.setItem(storageName, today);

        const notification = lumine.notifications.addHint(hintTitle, {
          description: hintDescription,
          dismissable: true,
          buttons: [
            {
              text: `Set to ${recommendedValue} and restart Lumine`,
              onDidClick() {
                lumine.config.set(configName, true);
                notification.dismiss();
                window.localStorage.removeItem(storageName);
                setTimeout(() => {
                  lumine.window.reload();
                }, 1500);
              },
            },
          ],
        });
      }
    }
  });
}

module.exports = { treeSitterHint };
