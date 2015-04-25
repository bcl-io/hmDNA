api-client-javascript
=====================

## Getting started

There are html and js files in this repository.
You can open the `index.html` files in your browser directly, but the javascript APIs won't work unless
the HTML is hosted somewhere. (The Bootstrap css won't load from a `file://` prefix either)

To run a simple HTTP server locally, you can use python:
```
cd api-client-javascript
python -m SimpleHTTPServer 8000
```

This will start a local server. Visit `http://localhost:8000/traitviewer`
to see the javascript example.

To get data from the API, you will also need to use a real Client ID.

* First create a [Genomics enabled project](https://console.developers.google.com/flows/enableapi?apiid=genomics)
  in the Google Developers Console.

* Once you are redirected to the **Credentials** tab, click **Create new Client ID** under
  the OAuth section.

* Set **Application type** to **Web application**, and change
  the **Authorized javascript origins** to `http://localhost:8000`

* Click the **Create Client ID** button

* From the newly created **Client ID for web application**, find the `Client ID`
  value.

* Using that Client ID value, load the code at:
  `http://localhost:8000/traitviewer#your-client-id-goes-here`


Note: If you want to run the code on any other domain, make sure you update the
javascript origins on your Client ID to include that new domain.


## Code layout

* traitviewer/index.html:

  loads [Bootstrap](getbootstrap.com) and [jQuery](http://jquery.com/)

  The file contains some simple html construction based on the `traits` json variable.
  It then uses `googlegenomics.jquery.js` to search variants and lookup
  genotype information for a callset.

* googlegenomics.jquery.js:

  this is a work-in-progress jQuery plugin that makes fetching data from the
  [Genomics API](http://cloud.google.com/genomics) a bit easier. It wraps
  [Google's javascript client library](https://developers.google.com/api-client-library/javascript/).


## Project status

### Goals

* Provide an example of how to use the javascript client library.
* Demonstrate how the variant APIs can be used to get call set data.

### Current status

Code needs some cleanup, but not much else is planned at this time.
