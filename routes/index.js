
// const express = require('express');

// const router = express.Router();

// // GET / 라우터
// router.get('/', (req, res) => {
//   res.send('Hello, Express');
// });

// module.exports = router;


const QUEUEIT_FAILED_HEADERNAME = "x-queueit-failed"; 
const QUEUEIT_CONNECTOR_EXECUTED_HEADER_NAME = "x-queueit-connector"; 
const QUEUEIT_CONNECTOR_NAME = "nodejs"; 
const QueueIT_Settings = { 
  QUEUEIT_CUSTOMER_ID: "chlitest", 
  QUEUEIT_SECRET_KEY: "e78cbb58-fada-4384-9833-1dda6550a0b8e817eaa4-022a-45b5-a330-f0544e1a3846", 
  QUEUEIT_API_KEY: "e7ae5f59-2c59-49a3-ae50-e436bd887744", 
  QUEUEIT_ENQT_ENABLED: true, 
  QUEUEIT_ENQT_VALIDITY_TIME: 4 * 60 * 1000, 
  QUEUEIT_ENQT_KEY_ENABLED: false, 
};
const { Token, Payload } = require("@queue-it/queue-token"); 

var express = require("express"); 
var router = express.Router(); 
var fs = require("fs"); 
var QueueITConnector = require("@queue-it/connector-javascript");

function isIgnored(req) { 
  return req.method == "HEAD" || req.method == "OPTIONS"; 
} 


// const ctrlUser = require('./user');
// /* GET user Router */
// router.route('/user')
//   .get(ctrlUser);

/* GET home page */ 
router.get("/", async function (req, res, next) { 
  try { 
    res.header(QUEUEIT_CONNECTOR_EXECUTED_HEADER_NAME, QUEUEIT_CONNECTOR_NAME); 
    if (isIgnored(req)) { 
      // Render page 
      res.render("index", { 
        node_version: process.version, 
        express_version: require("express/package").version, 
      }); return; 
    } 
    var integrationsConfigString = fs.readFileSync( 
      "chlitest_knownuser_integration_config.json", 
      "utf8", 
    ); 
    
    var customerId = QueueIT_Settings.QUEUEIT_CUSTOMER_ID; 
    var secretKey = QueueIT_Settings.QUEUEIT_SECRET_KEY; 
    var enqueueTokenValidityTime = QueueIT_Settings.QUEUEIT_ENQT_VALIDITY_TIME; 
    var enqueueTokenEnabled = QueueIT_Settings.QUEUEIT_ENQT_ENABLED; 
    var enqueueTokenKeyEnabled = QueueIT_Settings.QUEUEIT_ENQT_KEY_ENABLED; 
    var settings = { 
      customerId, 
      secretKey, 
      enqueueTokenEnabled, 
      enqueueTokenValidityTime, 
      enqueueTokenKeyEnabled, 
    }; 
    
    var contextProvider = initializeExpressContextProvider(req, res, settings); 
    var connector = QueueITConnector.KnownUser; 
    var queueitToken = req.query[connector.QueueITTokenKey]; 
    var requestUrl = contextProvider.getHttpRequest().getAbsoluteUri(); 
    var requestUrlWithoutToken = getRequestUrlWithoutToken(requestUrl); 
    // The requestUrlWithoutToken is used to match Triggers and as the Target url (where to return the users to). 
    // It is therefor important that this is exactly the url of the users browsers. So, if your webserver is 
    // behind e.g. a load balancer that modifies the host name or port, reformat requestUrl-WithoutToken before proceeding.

    var validationResult = await connector.validateRequestByIntegrationConfig( 
      requestUrlWithoutToken, 
      queueitToken, 
      integrationsConfigString, 
      customerId, 
      secretKey, 
      contextProvider, 
    ); 
    
    if (validationResult.doRedirect()) { 
      // Adding no cache headers to prevent browsers to cache requests 
      res.set({ 
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0", 
        Pragma: "no-cache", 
        Expires: "Fri, 01 Jan 1990 00:00:00 GMT", 
      }); 
      
      if (validationResult.isAjaxResult) { 
        // In case of ajax call send the user to the queue by sending a custom queue-it header and redirecting user to queue from javascript 
        const headerName = validationResult.getAjaxQueueRedirectHeaderKey(); 
        res.set(headerName, validationResult.getAjaxRedirectUrl()); 
        res.set("Access-Control-Expose-Headers", headerName); 
        
        // Render page 
        res.render("index", { 
          node_version: process.version, 
          express_version: require("express/package").version, 
        }); 
      } else { 
        // Send the user to the queue - either because hash was missing or because is was in-valid 
        res.redirect(validationResult.redirectUrl); 
      } 
    } else { 
      // Request can continue - we remove queueittoken form querystring parameter to avoid sharing of user specific token 
      if ( 
        requestUrl !== requestUrlWithoutToken && validationResult.actionType === "Queue" 
      ) { 
        res.redirect(requestUrlWithoutToken);
       } else { 
        // Render page
        res.render("index", { 
          node_version: process.version, 
          express_version: require("express/package").version, 
        }); 
      } 
    } 
  } catch (e) { 
    // There was an error validating the request 
    // Use your own logging framework to log the error 
    // This was a configuration error, so we let the user continue 
    console.log("ERROR:" + e); 
    res.header(QUEUEIT_FAILED_HEADERNAME, "true"); 
  } 
}); 

function getRequestUrlWithoutToken(requestUrl) { 
  try { 
    const url = new URL(requestUrl); 
    const params = new URLSearchParams(url.search); 
    
    params.delete(QueueITConnector.KnownUser.QueueITTokenKey); 
    url.search = params.toString(); 
    
    return url.toString(); 
  } catch (e) { 
    console.error("[Queue IT] Could not remove token in URL", e); 
    return requestUrl; 
  } 
}

function initializeExpressContextProvider(req, res, settings) { 
  return { 
    getCryptoProvider: function () { 
      // Code to configure hashing in the Connector (requires node module 'crypto'): 
      return { 
        getSha256Hash: function (secretKey, plaintext) { 
          const crypto = require("crypto"); 
          const hash = crypto 
            .createHmac("sha256", secretKey)
            .update(plaintext) 
            .digest("hex"); 
          return hash; 
        }, 
      };
     }, 
     getEnqueueTokenProvider: function () { 
      if (!settings.enqueueTokenEnabled) { 
        return null; 
      } 
      return initializeEnqueueTokenProvider(req, settings); 
    }, 
    getHttpRequest: function () { 
      var httpRequest = { 
        getUserAgent: function () { 
          return this.getHeader("user-agent"); 
        }, 
        getHeader: function (headerName) { 
          if (headerName === "x-queueit-clientip") 
            return this.getUserHostAddress(); 
          
          var headerValue = req.header(headerName); 
          
          if (!headerValue) return ""; 
          
          return headerValue; 
        }, 
        getAbsoluteUri: function () { 
          return req.protocol + "://" + req.get("host") + req.originalUrl; 
        }, 
        getUserHostAddress: function () { 
          return req.ip; 
        }, 
        getCookieValue: function (cookieKey) { 
          // This requires 'cookie-parser' node module (installed/used from app.js) 
          return req.cookies[cookieKey]; 
        }, 
      }; return httpRequest; 
    }, 
    getHttpResponse: function () { 
      var httpResponse = { 
        setCookie: function ( 
          cookieName, 
          cookieValue,
          domain, 
          expiration, 
          isCookieHttpOnly, 
          isCookieSecure, 
        ) { 
          if (domain === "") domain = null; 
          
          // expiration is in secs, but Date needs it in milisecs 
          const expirationDate = new Date(expiration * 1000); 
          
          // This requires 'cookie-parser' node module (installed/used from app.js) 
          res.cookie(cookieName, cookieValue, { 
            expires: expirationDate, 
            path: "/", 
            domain: domain, 
            secure: isCookieSecure, 
            httpOnly: isCookieHttpOnly, 
          }); 
        }, 
      }; 
      return httpResponse; 
    }, 
  }; 
}

function initializeEnqueueTokenProvider(req, settings) { 
  let enqueueTokenProvider = new QueueITConnector.DefaultEnqueueTokenProvider( 
    settings.customerId, 
    settings.secretKey, 
    settings.enqueueTokenValidityTime, 
    req.ip, 
    settings.enqueueTokenKeyEnabled, 
    Token, 
    Payload, 
  ); 
  
  // If you need to send custom data then use following code. 
  
  // enqueueTokenProvider.getEnqueueTokenCustomData = function(waitingRoomId){ 
  //   return [{"key": "", "value" : ""}]; 
  // };

  // If you need to use some specific key in the enqueue toke then you can use the following code. 
  
  // enqueueTokenProvider.getEnqueueTokenKey = function(waitingRoomId){ 
  //   if (!settings.enqueueTokenKeyEnabled) 
  //   { 
  //     return null; 
  //   } 
  //     return generateUUID() 
  //   };
  return enqueueTokenProvider;
}

module.exports = router;
