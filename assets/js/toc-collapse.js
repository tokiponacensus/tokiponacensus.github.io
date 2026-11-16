(function () {
  "use strict";

  var narrowScreen = window.matchMedia("(max-width: 1023px)");
  var tablesOfContents = document.querySelectorAll(".toc__details");

  function setInitialState() {
    tablesOfContents.forEach(function (tableOfContents) {
      tableOfContents.open = !narrowScreen.matches;
      tableOfContents.querySelector("summary").tabIndex = narrowScreen.matches ? 0 : -1;
    });
  }

  setInitialState();

  if (narrowScreen.addEventListener) {
    narrowScreen.addEventListener("change", setInitialState);
  } else {
    narrowScreen.addListener(setInitialState);
  }

  tablesOfContents.forEach(function (tableOfContents) {
    tableOfContents.querySelectorAll(".toc__menu a").forEach(function (link) {
      link.addEventListener("click", function () {
        if (narrowScreen.matches) tableOfContents.open = false;
      });
    });
  });
})();
