webpackHotUpdate_N_E("pages/index",{

/***/ "./pages/index.js":
/*!************************!*\
  !*** ./pages/index.js ***!
  \************************/
/*! exports provided: default */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* WEBPACK VAR INJECTION */(function(module) {/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, "default", function() { return Home; });
/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ "./node_modules/react/jsx-dev-runtime.js");
/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! @babel/runtime/regenerator */ "./node_modules/@babel/runtime/regenerator/index.js");
/* harmony import */ var _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _babel_runtime_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @babel/runtime/helpers/esm/asyncToGenerator */ "./node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../styles/Home.module.css */ "./styles/Home.module.css");
/* harmony import */ var _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var react_hook_form__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! react-hook-form */ "./node_modules/react-hook-form/dist/index.esm.js");
/* harmony import */ var _components_ResultsCard__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../components/ResultsCard */ "./components/ResultsCard.js");
/* harmony import */ var _components_SearchInfo__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../components/SearchInfo */ "./components/SearchInfo.js");




var _jsxFileName = "C:\\Users\\fitbi\\code-projects\\ISMSearch\\pages\\index.js",
    _s = $RefreshSig$();






function Home() {
  _s();

  var _results$hits, _results$hits2, _results$hits3;

  var _useForm = Object(react_hook_form__WEBPACK_IMPORTED_MODULE_5__["useForm"])(),
      register = _useForm.register,
      handleSubmit = _useForm.handleSubmit,
      errors = _useForm.errors;

  var _useState = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])([]),
      results = _useState[0],
      setResults = _useState[1];

  var _useState2 = Object(react__WEBPACK_IMPORTED_MODULE_3__["useState"])(""),
      error = _useState2[0],
      setError = _useState2[1];

  var searchQuery = /*#__PURE__*/function () {
    var _ref = Object(_babel_runtime_helpers_esm_asyncToGenerator__WEBPACK_IMPORTED_MODULE_2__["default"])( /*#__PURE__*/_babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.mark(function _callee(data) {
      var _process$env$NEXT_PUB;

      var url, res, json;
      return _babel_runtime_regenerator__WEBPACK_IMPORTED_MODULE_1___default.a.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              url = '';

              if (data.PROTECTED) {
                url = "".concat("https://1a71b4f7f9be.ngrok.io", "/api/ism?searchFilters=(PROTECTED = Yes AND OFFICIAL = No)&queryLimit=").concat(data.numberOfResults);
              } else if (data.NOTOPORSECRET) {
                url = "".concat("https://1a71b4f7f9be.ngrok.io", "/api/ism?searchFilters=(TOPSECRET= No AND SECRET = No)&queryLimit=").concat(data.numberOfResults, "&searchQuery=").concat(data.searchTerm);
              } else {
                url = "".concat("https://1a71b4f7f9be.ngrok.io", "/api/ism?queryLimit=").concat(data.numberOfResults, "&searchQuery=").concat(data.searchTerm);
              }

              _context.next = 4;
              return fetch(url, {
                headers: {
                  "Access-Control-Allow-Origin": "".concat((_process$env$NEXT_PUB = "ism-search.com") !== null && _process$env$NEXT_PUB !== void 0 ? _process$env$NEXT_PUB : 'http://localhost:3000'),
                  "Access-Control-Allow-Headers": "Content-Type",
                  "Access-Control-Allow-Methods": "GET"
                }
              });

            case 4:
              res = _context.sent;

              if (!res.ok) {
                _context.next = 13;
                break;
              }

              _context.next = 8;
              return res.json();

            case 8:
              json = _context.sent;
              setResults(json);
              return _context.abrupt("return");

            case 13:
              setError("An error occurred. Please try again later.");
              return _context.abrupt("return");

            case 15:
            case "end":
              return _context.stop();
          }
        }
      }, _callee);
    }));

    return function searchQuery(_x) {
      return _ref.apply(this, arguments);
    };
  }();

  return /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("div", {
    className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.container,
    children: [/*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("main", {
      className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.main,
      children: [/*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("h1", {
        className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.title,
        children: "ISM Search"
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 48,
        columnNumber: 9
      }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("p", {
        className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.description,
        children: "Get started by entering a search term below..."
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 52,
        columnNumber: 9
      }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("div", {
        className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.card,
        children: /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("strong", {
          children: /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("a", {
            href: "/disclaimer",
            children: "Disclaimer"
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 57,
            columnNumber: 19
          }, this)
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 57,
          columnNumber: 11
        }, this)
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 56,
        columnNumber: 9
      }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("div", {
        className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.card,
        children: [/*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("p", {
          children: "Last updated: 22/01/2021"
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 61,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("br", {}, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 62,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("h3", {
          children: "Coming soon..."
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 63,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("li", {
          children: "Export to csv function"
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 64,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("li", {
          children: "Notification of new ISM version"
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 65,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("li", {
          children: "Searchable previous versions of the ISM"
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 66,
          columnNumber: 11
        }, this)]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 60,
        columnNumber: 9
      }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("form", {
        onSubmit: handleSubmit(searchQuery),
        children: [/*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("label", {
          children: ["Enter search term here.. ie. 0041 or CISO", /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("input", {
            placeholder: "Enter search term...",
            style: {
              borderRadius: '25px',
              width: '100%',
              padding: '12px 20px',
              margin: '8px 0px',
              border: '2px solid black'
            },
            name: "searchTerm",
            ref: register({
              required: false
            })
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 73,
            columnNumber: 15
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 71,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("label", {
          children: ["Limit results", /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("br", {}, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 77,
            columnNumber: 15
          }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("input", {
            defaultValue: 10,
            style: {
              borderRadius: '25px',
              width: '20%',
              padding: '12px 20px',
              margin: '8px 0px',
              border: '2px solid black'
            },
            type: "number",
            name: "numberOfResults",
            ref: register({
              required: false
            }),
            min: "1",
            max: "800"
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 78,
            columnNumber: 15
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 75,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("br", {}, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 80,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("label", {
          children: ["Show me only PROTECTED controls", /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("input", {
            type: 'checkbox',
            style: {
              height: '15px',
              width: '15px'
            },
            name: "PROTECTED",
            ref: register({
              required: false
            })
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 83,
            columnNumber: 15
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 81,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("br", {}, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 85,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("label", {
          children: ["Exclude SECRET and TOP SECRET controls from result", /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("input", {
            type: 'checkbox',
            style: {
              height: '15px',
              width: '15px'
            },
            name: "NOTOPORSECRET",
            ref: register({
              required: false
            })
          }, void 0, false, {
            fileName: _jsxFileName,
            lineNumber: 88,
            columnNumber: 15
          }, this)]
        }, void 0, true, {
          fileName: _jsxFileName,
          lineNumber: 86,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("br", {}, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 91,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("br", {}, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 92,
          columnNumber: 11
        }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("button", {
          style: {
            fontWeight: 'bold',
            borderRadius: '25px',
            backgroundColor: '#4ecca3',
            border: 'none',
            color: '#eeeeee',
            padding: '16px 32px',
            width: '100%'
          },
          type: "submit",
          children: "Submit"
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 93,
          columnNumber: 11
        }, this)]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 69,
        columnNumber: 9
      }, this), (results === null || results === void 0 ? void 0 : (_results$hits = results.hits) === null || _results$hits === void 0 ? void 0 : _results$hits.length) < 1 && /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("div", {
        className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.card,
        children: [/*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("p", {
          children: "No results..."
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 98,
          columnNumber: 13
        }, this), error && /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("p", {
          children: error
        }, void 0, false, {
          fileName: _jsxFileName,
          lineNumber: 99,
          columnNumber: 23
        }, this)]
      }, void 0, true, {
        fileName: _jsxFileName,
        lineNumber: 97,
        columnNumber: 11
      }, this), (results === null || results === void 0 ? void 0 : (_results$hits2 = results.hits) === null || _results$hits2 === void 0 ? void 0 : _results$hits2.length) > 0 && /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])(_components_SearchInfo__WEBPACK_IMPORTED_MODULE_7__["default"], {
        results: results
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 104,
        columnNumber: 11
      }, this), (results === null || results === void 0 ? void 0 : (_results$hits3 = results.hits) === null || _results$hits3 === void 0 ? void 0 : _results$hits3.length) > 0 && /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])(_components_ResultsCard__WEBPACK_IMPORTED_MODULE_6__["default"], {
        results: results
      }, void 0, false, {
        fileName: _jsxFileName,
        lineNumber: 108,
        columnNumber: 11
      }, this)]
    }, void 0, true, {
      fileName: _jsxFileName,
      lineNumber: 47,
      columnNumber: 7
    }, this), /*#__PURE__*/Object(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__["jsxDEV"])("footer", {
      className: _styles_Home_module_css__WEBPACK_IMPORTED_MODULE_4___default.a.footer,
      children: "\xA9 - Justin Middler 2021"
    }, void 0, false, {
      fileName: _jsxFileName,
      lineNumber: 113,
      columnNumber: 7
    }, this)]
  }, void 0, true, {
    fileName: _jsxFileName,
    lineNumber: 46,
    columnNumber: 5
  }, this);
}

_s(Home, "mwhM9Wk6/Ptbfv9QmiMHj0ojVeQ=", false, function () {
  return [react_hook_form__WEBPACK_IMPORTED_MODULE_5__["useForm"]];
});

_c = Home;

var _c;

$RefreshReg$(_c, "Home");

;
    var _a, _b;
    // Legacy CSS implementations will `eval` browser code in a Node.js context
    // to extract CSS. For backwards compatibility, we need to check we're in a
    // browser context before continuing.
    if (typeof self !== 'undefined' &&
        // AMP / No-JS mode does not inject these helpers:
        '$RefreshHelpers$' in self) {
        var currentExports = module.__proto__.exports;
        var prevExports = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevExports) !== null && _b !== void 0 ? _b : null;
        // This cannot happen in MainTemplate because the exports mismatch between
        // templating and execution.
        self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.i);
        // A module can be accepted automatically based on its exports, e.g. when
        // it is a Refresh Boundary.
        if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {
            // Save the previous exports on update so we can compare the boundary
            // signatures.
            module.hot.dispose(function (data) {
                data.prevExports = currentExports;
            });
            // Unconditionally accept an update to this module, we'll check if it's
            // still a Refresh Boundary later.
            module.hot.accept();
            // This field is set when the previous version of this module was a
            // Refresh Boundary, letting us know we need to check for invalidation or
            // enqueue an update.
            if (prevExports !== null) {
                // A boundary can become ineligible if its exports are incompatible
                // with the previous exports.
                //
                // For example, if you add/remove/change exports, we'll want to
                // re-execute the importing modules, and force those components to
                // re-render. Similarly, if you convert a class component to a
                // function, we want to invalidate the boundary.
                if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevExports, currentExports)) {
                    module.hot.invalidate();
                }
                else {
                    self.$RefreshHelpers$.scheduleUpdate();
                }
            }
        }
        else {
            // Since we just executed the code for the module, it's possible that the
            // new exports made it ineligible for being a boundary.
            // We only care about the case when we were _previously_ a boundary,
            // because we already accepted this update (accidental side effect).
            var isNoLongerABoundary = prevExports !== null;
            if (isNoLongerABoundary) {
                module.hot.invalidate();
            }
        }
    }

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../node_modules/webpack/buildin/harmony-module.js */ "./node_modules/webpack/buildin/harmony-module.js")(module)))

/***/ })

})
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9fTl9FLy4vcGFnZXMvaW5kZXguanMiXSwibmFtZXMiOlsiSG9tZSIsInVzZUZvcm0iLCJyZWdpc3RlciIsImhhbmRsZVN1Ym1pdCIsImVycm9ycyIsInVzZVN0YXRlIiwicmVzdWx0cyIsInNldFJlc3VsdHMiLCJlcnJvciIsInNldEVycm9yIiwic2VhcmNoUXVlcnkiLCJkYXRhIiwidXJsIiwiUFJPVEVDVEVEIiwicHJvY2VzcyIsIm51bWJlck9mUmVzdWx0cyIsIk5PVE9QT1JTRUNSRVQiLCJzZWFyY2hUZXJtIiwiZmV0Y2giLCJoZWFkZXJzIiwicmVzIiwib2siLCJqc29uIiwic3R5bGVzIiwiY29udGFpbmVyIiwibWFpbiIsInRpdGxlIiwiZGVzY3JpcHRpb24iLCJjYXJkIiwiYm9yZGVyUmFkaXVzIiwid2lkdGgiLCJwYWRkaW5nIiwibWFyZ2luIiwiYm9yZGVyIiwicmVxdWlyZWQiLCJoZWlnaHQiLCJmb250V2VpZ2h0IiwiYmFja2dyb3VuZENvbG9yIiwiY29sb3IiLCJoaXRzIiwibGVuZ3RoIiwiZm9vdGVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVlLFNBQVNBLElBQVQsR0FBZ0I7QUFBQTs7QUFBQTs7QUFBQSxpQkFFY0MsK0RBQU8sRUFGckI7QUFBQSxNQUVyQkMsUUFGcUIsWUFFckJBLFFBRnFCO0FBQUEsTUFFWEMsWUFGVyxZQUVYQSxZQUZXO0FBQUEsTUFFR0MsTUFGSCxZQUVHQSxNQUZIOztBQUFBLGtCQUdDQyxzREFBUSxDQUFDLEVBQUQsQ0FIVDtBQUFBLE1BR3RCQyxPQUhzQjtBQUFBLE1BR2JDLFVBSGE7O0FBQUEsbUJBSUhGLHNEQUFRLENBQUMsRUFBRCxDQUpMO0FBQUEsTUFJdEJHLEtBSnNCO0FBQUEsTUFJZkMsUUFKZTs7QUFNN0IsTUFBTUMsV0FBVztBQUFBLGdNQUFHLGlCQUFPQyxJQUFQO0FBQUE7O0FBQUE7QUFB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QU8sRUFBRWxDO0FBQXJCO0FBQUE7QUFBQTtBQUFBO0FBQUEsY0F6REosRUE0REcsQ0FBQUEsT0FBTyxTQUFQLElBQUFBLE9BQU8sV0FBUCw4QkFBQUEsT0FBTyxDQUFFaUMsSUFBVCxrRUFBZUMsTUFBZixJQUF3QixDQUF4QixpQkFDQyxxRUFBQywrREFBRDtBQUFhLGVBQU8sRUFBRWxDO0FBQXRCO0FBQUE7QUFBQTtBQUFBO0FBQUEsY0E3REo7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFlBREYsZUFtRUU7QUFBUSxlQUFTLEVBQUVpQiw4REFBTSxDQUFDa0IsTUFBMUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsWUFuRUY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFVBREY7QUF5RUQ7O0dBL0d1QnpDLEk7VUFFcUJDLHVEOzs7S0FGckJELEkiLCJmaWxlIjoic3RhdGljL3dlYnBhY2svcGFnZXMvaW5kZXguYTZjOGVmYTU2OTkzNjFmOTZjY2EuaG90LXVwZGF0ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCwgeyB1c2VTdGF0ZSB9IGZyb20gJ3JlYWN0JztcclxuaW1wb3J0IHN0eWxlcyBmcm9tICcuLi9zdHlsZXMvSG9tZS5tb2R1bGUuY3NzJ1xyXG5pbXBvcnQgeyB1c2VGb3JtIH0gZnJvbSBcInJlYWN0LWhvb2stZm9ybVwiO1xyXG5pbXBvcnQgUmVzdWx0c0NhcmQgZnJvbSAnLi4vY29tcG9uZW50cy9SZXN1bHRzQ2FyZCdcclxuaW1wb3J0IFNlYXJjaEluZm8gZnJvbSAnLi4vY29tcG9uZW50cy9TZWFyY2hJbmZvJ1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gSG9tZSgpIHtcclxuXHJcbiAgY29uc3QgeyByZWdpc3RlciwgaGFuZGxlU3VibWl0LCBlcnJvcnMgfSA9IHVzZUZvcm0oKTtcclxuICBjb25zdCBbcmVzdWx0cywgc2V0UmVzdWx0c10gPSB1c2VTdGF0ZShbXSk7XHJcbiAgY29uc3QgW2Vycm9yLCBzZXRFcnJvcl0gPSB1c2VTdGF0ZShcIlwiKTtcclxuXHJcbiAgY29uc3Qgc2VhcmNoUXVlcnkgPSBhc3luYyAoZGF0YSkgPT4ge1xyXG5cclxuICAgIGxldCB1cmwgPSAnJ1xyXG4gICAgaWYoZGF0YS5QUk9URUNURUQpIHtcclxuICAgICAgdXJsID0gYCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQVBJX0JBU0VfVVJMfS9hcGkvaXNtP3NlYXJjaEZpbHRlcnM9KFBST1RFQ1RFRCA9IFllcyBBTkQgT0ZGSUNJQUwgPSBObykmcXVlcnlMaW1pdD0ke2RhdGEubnVtYmVyT2ZSZXN1bHRzfWBcclxuICAgIH1cclxuICAgIGVsc2UgaWYoZGF0YS5OT1RPUE9SU0VDUkVUKSB7XHJcbiAgICAgIHVybCA9IGAke3Byb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0FQSV9CQVNFX1VSTH0vYXBpL2lzbT9zZWFyY2hGaWx0ZXJzPShUT1BTRUNSRVQ9IE5vIEFORCBTRUNSRVQgPSBObykmcXVlcnlMaW1pdD0ke2RhdGEubnVtYmVyT2ZSZXN1bHRzfSZzZWFyY2hRdWVyeT0ke2RhdGEuc2VhcmNoVGVybX1gXHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgdXJsID0gYCR7cHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfQVBJX0JBU0VfVVJMfS9hcGkvaXNtP3F1ZXJ5TGltaXQ9JHtkYXRhLm51bWJlck9mUmVzdWx0c30mc2VhcmNoUXVlcnk9JHtkYXRhLnNlYXJjaFRlcm19YFxyXG4gICAgfVxyXG5cclxuICAgIGxldCByZXMgPSBhd2FpdCBmZXRjaCh1cmwsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAgIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCI6IGAke3Byb2Nlc3MuZW52Lk5FWFRfUFVCTElDX0NPUlNfRE9NQUlOID8/ICdodHRwOi8vbG9jYWxob3N0OjMwMDAnfWAsXHJcbiAgICAgICAgICAgICAgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzXCI6IFwiQ29udGVudC1UeXBlXCIsXHJcbiAgICAgICAgICAgICAgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzXCI6IFwiR0VUXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH1cclxuICAgICAgKVxyXG4gICAgaWYgKHJlcy5vaykge1xyXG4gICAgICBsZXQganNvbiA9IGF3YWl0IHJlcy5qc29uKClcclxuICAgICAgc2V0UmVzdWx0cyhqc29uKVxyXG4gICAgICByZXR1cm4gXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzZXRFcnJvcihcIkFuIGVycm9yIG9jY3VycmVkLiBQbGVhc2UgdHJ5IGFnYWluIGxhdGVyLlwiKVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmNvbnRhaW5lcn0+XHJcbiAgICAgIDxtYWluIGNsYXNzTmFtZT17c3R5bGVzLm1haW59PlxyXG4gICAgICAgIDxoMSBjbGFzc05hbWU9e3N0eWxlcy50aXRsZX0+XHJcbiAgICAgICAgICBJU00gU2VhcmNoXHJcbiAgICAgICAgPC9oMT5cclxuXHJcbiAgICAgICAgPHAgY2xhc3NOYW1lPXtzdHlsZXMuZGVzY3JpcHRpb259PlxyXG4gICAgICAgICAgR2V0IHN0YXJ0ZWQgYnkgZW50ZXJpbmcgYSBzZWFyY2ggdGVybSBiZWxvdy4uLlxyXG4gICAgICAgIDwvcD5cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jYXJkfT5cclxuICAgICAgICAgIDxzdHJvbmc+PGEgaHJlZj0nL2Rpc2NsYWltZXInPkRpc2NsYWltZXI8L2E+PC9zdHJvbmc+XHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMuY2FyZH0+XHJcbiAgICAgICAgICA8cD5MYXN0IHVwZGF0ZWQ6IDIyLzAxLzIwMjE8L3A+XHJcbiAgICAgICAgICA8YnIgLz5cclxuICAgICAgICAgIDxoMz5Db21pbmcgc29vbi4uLjwvaDM+XHJcbiAgICAgICAgICA8bGk+RXhwb3J0IHRvIGNzdiBmdW5jdGlvbjwvbGk+XHJcbiAgICAgICAgICA8bGk+Tm90aWZpY2F0aW9uIG9mIG5ldyBJU00gdmVyc2lvbjwvbGk+XHJcbiAgICAgICAgICA8bGk+U2VhcmNoYWJsZSBwcmV2aW91cyB2ZXJzaW9ucyBvZiB0aGUgSVNNPC9saT5cclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgPGZvcm0gb25TdWJtaXQ9e2hhbmRsZVN1Ym1pdChzZWFyY2hRdWVyeSl9PlxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICA8bGFiZWw+XHJcbiAgICAgICAgICAgICAgRW50ZXIgc2VhcmNoIHRlcm0gaGVyZS4uIGllLiAwMDQxIG9yIENJU09cclxuICAgICAgICAgICAgICA8aW5wdXQgcGxhY2Vob2xkZXI9e1wiRW50ZXIgc2VhcmNoIHRlcm0uLi5cIn0gc3R5bGU9e3sgYm9yZGVyUmFkaXVzOiAnMjVweCcsIHdpZHRoOiAnMTAwJScsIHBhZGRpbmc6ICcxMnB4IDIwcHgnLCBtYXJnaW46ICc4cHggMHB4JywgYm9yZGVyOiAnMnB4IHNvbGlkIGJsYWNrJyB9fSBuYW1lPVwic2VhcmNoVGVybVwiIHJlZj17cmVnaXN0ZXIoeyByZXF1aXJlZDogZmFsc2UgfSl9IC8+XHJcbiAgICAgICAgICA8L2xhYmVsPlxyXG4gICAgICAgICAgPGxhYmVsPlxyXG4gICAgICAgICAgICAgIExpbWl0IHJlc3VsdHNcclxuICAgICAgICAgICAgICA8YnIgLz5cclxuICAgICAgICAgICAgICA8aW5wdXQgZGVmYXVsdFZhbHVlPXsxMH0gc3R5bGU9e3sgYm9yZGVyUmFkaXVzOiAnMjVweCcsIHdpZHRoOiAnMjAlJywgcGFkZGluZzogJzEycHggMjBweCcsIG1hcmdpbjogJzhweCAwcHgnLCBib3JkZXI6ICcycHggc29saWQgYmxhY2snIH19IHR5cGU9XCJudW1iZXJcIiBuYW1lPVwibnVtYmVyT2ZSZXN1bHRzXCIgcmVmPXtyZWdpc3Rlcih7IHJlcXVpcmVkOiBmYWxzZSB9KX0gbWluPVwiMVwiIG1heD1cIjgwMFwiPjwvaW5wdXQ+XHJcbiAgICAgICAgICA8L2xhYmVsPlxyXG4gICAgICAgICAgPGJyIC8+XHJcbiAgICAgICAgICA8bGFiZWw+XHJcbiAgICAgICAgICAgICAgU2hvdyBtZSBvbmx5IFBST1RFQ1RFRCBjb250cm9sc1xyXG4gICAgICAgICAgICAgIDxpbnB1dCB0eXBlPXsnY2hlY2tib3gnfSBzdHlsZT17e2hlaWdodDonMTVweCcsIHdpZHRoOicxNXB4J319IG5hbWU9XCJQUk9URUNURURcIiByZWY9e3JlZ2lzdGVyKHsgcmVxdWlyZWQ6IGZhbHNlIH0pfSAvPlxyXG4gICAgICAgICAgPC9sYWJlbD5cclxuICAgICAgICAgIDxiciAvPlxyXG4gICAgICAgICAgPGxhYmVsPlxyXG4gICAgICAgICAgICAgIEV4Y2x1ZGUgU0VDUkVUIGFuZCBUT1AgU0VDUkVUIGNvbnRyb2xzIGZyb20gcmVzdWx0XHJcbiAgICAgICAgICAgICAgPGlucHV0IHR5cGU9eydjaGVja2JveCd9IHN0eWxlPXt7aGVpZ2h0OicxNXB4Jywgd2lkdGg6JzE1cHgnfX0gbmFtZT1cIk5PVE9QT1JTRUNSRVRcIiByZWY9e3JlZ2lzdGVyKHsgcmVxdWlyZWQ6IGZhbHNlIH0pfSAvPlxyXG4gICAgICAgICAgPC9sYWJlbD5cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgPGJyIC8+XHJcbiAgICAgICAgICA8YnIgLz5cclxuICAgICAgICAgIDxidXR0b24gc3R5bGU9e3sgZm9udFdlaWdodDonYm9sZCcsIGJvcmRlclJhZGl1czogJzI1cHgnLCBiYWNrZ3JvdW5kQ29sb3I6ICcjNGVjY2EzJywgYm9yZGVyOiAnbm9uZScsIGNvbG9yOiAnI2VlZWVlZScsIHBhZGRpbmc6ICcxNnB4IDMycHgnLCB3aWR0aDogJzEwMCUnIH19IHR5cGU9XCJzdWJtaXRcIj5TdWJtaXQ8L2J1dHRvbj5cclxuICAgICAgICA8L2Zvcm0+XHJcblxyXG4gICAgICAgIHtyZXN1bHRzPy5oaXRzPy5sZW5ndGggPCAxICYmXHJcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmNhcmR9PlxyXG4gICAgICAgICAgICA8cD5ObyByZXN1bHRzLi4uPC9wPlxyXG4gICAgICAgICAgICB7ZXJyb3IgJiYgPHA+e2Vycm9yfTwvcD59XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHtyZXN1bHRzPy5oaXRzPy5sZW5ndGggPiAwICYmXHJcbiAgICAgICAgICA8U2VhcmNoSW5mbyByZXN1bHRzPXtyZXN1bHRzfSAvPlxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAge3Jlc3VsdHM/LmhpdHM/Lmxlbmd0aCA+IDAgJiZcclxuICAgICAgICAgIDxSZXN1bHRzQ2FyZCByZXN1bHRzPXtyZXN1bHRzfSAvPlxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgIDwvbWFpbj5cclxuXHJcbiAgICAgIDxmb290ZXIgY2xhc3NOYW1lPXtzdHlsZXMuZm9vdGVyfT5cclxuICAgICAgICAmY29weTsgLSBKdXN0aW4gTWlkZGxlciAyMDIxXHJcbiAgICAgIDwvZm9vdGVyPlxyXG4gICAgPC9kaXY+XHJcbiAgKVxyXG59XHJcbiJdLCJzb3VyY2VSb290IjoiIn0=