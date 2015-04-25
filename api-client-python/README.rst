api-client-python
=================

Getting started
---------------

This Python client demonstrates a simple web-based genome browser that fetches data from the 
`Google Genomics API`_, the NCBI Genomics API or the Local Readstore through a web
interface, and displays a pileup of reads with support for zooming and basic navigation and search.

You can try out the sample genome browser, called GABrowse, now by going to https://gabrowse.appspot.com.

It can be run with app engine or without.
See `the docs <http://googlegenomics.readthedocs.org/en/latest/api-client-python>`_
for more information.

.. _Google Genomics Api: https://cloud.google.com/genomics

Running on App Engine
~~~~~~~~~~~~~~~~~~~~~

To run with app engine, you'll need to download and install `Google App Engine SDK for Python
<https://cloud.google.com/appengine/downloads>`_.

On Mac OS X you can setup and run the application through the GoogleAppEngineLauncher UI. 
To use the command line or to run on Linux::

  cd api-client-python
  dev_appserver.py .
  
To run on Windows::

  cd api-client-python
  python c:\path\to\dev_appserver.py .

Once running, visit ``http://localhost:8080`` in your browser to browse data from the API.


Running with paste and webapp2
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you don't want to use App Engine, you can instead run the local server with paste.
First you'll need to `install pip <http://www.pip-installer.org/en/latest/installing.html>`_.

Then install the required dependencies and run the ``localserver.py`` file::

  pip install WebOb Paste webapp2 jinja2
  python localserver.py

Enabling the Google API
~~~~~~~~~~~~~~~~~~~~~~~

If you want to pull in data from `Google Genomics API`_ you will need to store a valid
Google API key into a file named ``google_api_key.txt``.

* First create a `Genomics enabled project <https://console.developers.google.com/flows/enableapi?apiid=genomics>`_ 
  in the Google Developers Console.

* Once you are redirected to the **Credentials** tab, click **create new key** under
  the Public API access section.

* Select **Server key** in the dialog that pops up, and then click **Create**.
  (You don't need to enter anything in the text box)

* Copy the **API key** field value that now appears in the Public API access
  section into a new file named ``google_api_key.txt`` in the same directory as ``main.py``.
  The file should consist of a single undecorated line like this::

    abcdef12345abcdef

Note: You can also reuse an existing API key if you have one.
Just make sure the Genomics API is turned on.


Troubleshooting
~~~~~~~~~~~~~~~
  
* The ``google.appengine.tools.devappserver2.wsgi_server.BindError: Unable to bind`` message 
  means that one of the default App Engine ports is unavailable. The default ports are 8080 and 8000. 
  You can try different ports with these flags::

    python dev_appserver.py --port 12080 --admin_port=12000 .
  
  Your server will then be available at ``localhost:12080``.

* Problem with a non-Chrome browser? Please 
  `file an issue <https://github.com/googlegenomics/api-client-python/issues/new>`_.
  jQuery and d3 get us a lot of browser portability for free - 
  but testing on all configurations is tricky, so just let us know 
  if there are issues!

Code layout
-----------

main.py:
  queries the Genomics API and handles all OAuth flows. It also serves up the HTML
  pages.

main.html:
  is the main HTML page. It is displayed once the user has granted OAuth access to
  the Genomics API.
  It provides the basic page layout, but most of the display logic is handled in
  JavaScript.

static/js/main.js:
  provides some JS utility functions, and calls into ``readgraph.js``.

static/js/readgraph.js:
  handles the visualization of reads. It contains the most complex code and uses
  `d3.js <http://d3js.org>`_ to display actual Read data.

The python client also depends on several external libraries:

`httplib2`_:
  used to fetch data from API providers

`D3`_:
  is a javascript library used to make rich visualizations

`Underscore.js`_:
  is a javascript library that provides a variety of utilities

`Bootstrap`_:
  supplies a great set of default css, icons, and js helpers

In ``main.html``, `jQuery <http://jquery.com>`_ is also loaded from an external
site.

.. _httplib2: https://github.com/jcgregorio/httplib2
.. _D3: http://d3js.org
.. _Underscore.js: http://underscorejs.org
.. _Bootstrap: http://getbootstrap.com


Project status
--------------

Goals
~~~~~
* Provide an easily deployable demo that demonstrates what Genomics API interop
  can achieve for the community.
* Provide an example of how to use the Genomics APIs and OAuth to build a
  non-trivial python application.


Current status
~~~~~~~~~~~~~~
This code *wants* to be in active development, but has few contributions coming
in at the moment.

Currently, it provides a basic genome browser that can consume genomic data
from any API provider. It deploys on App Engine (to meet the
'easily deployable' goal), and has a layman-friendly UI.

Awesome possible features include:

* Add more information to the read display (show inserts, highlight mismatches
  against the reference, etc)
* Possibly cleaning up the js code to be more plugin friendly - so that pieces
  could be shared and reused (d3 library? jquery plugin?)
* Staying up to date on API changes (readset searching now has pagination, etc)
* Better searching of Snpedia (or another provider - EBI?)
* Other enhancement ideas are very welcome
* (for smaller/additional tasks see the GitHub issues)
