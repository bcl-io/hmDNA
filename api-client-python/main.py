"""
Copyright 2014 Google Inc. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

This file serves two main purposes
- it serves up the main html page
- and it provides a simple set of apis to the javascript
"""

import httplib2
import time
import jinja2
import json
import logging
import os
import re
import socket
import webapp2

socket.setdefaulttimeout(60)
http = httplib2.Http(timeout=60)

JINJA_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
    autoescape=True,
    extensions=['jinja2.ext.autoescape'])


# TODO: Dataset information should come from the list datasets api call
# But that call is not in the GA4GH API yet
SUPPORTED_BACKENDS = {
  'Ensembl' : {'name': 'Ensembl',
            'url': 'http://193.62.52.232:8081/%s?%s',
            'datasets': {'1000 genomes pilot 2': '2'}}
}

# Google requires a valid API key.  If the file 'google_api_key.txt' exists
# then the Google API will be enabled.
google_api_key_file = os.path.join(os.path.dirname(__file__), 'google_api_key.txt')
if os.path.isfile(google_api_key_file):
  with open(google_api_key_file, 'r') as file:
    api_key = file.readline().strip()
    SUPPORTED_BACKENDS['GOOGLE'] = {
      'name': 'Google',
      'url': 'https://www.googleapis.com/genomics/v1beta2/%s?key='
             + api_key + '&%s',
      'supportsPartialResponse': True,
      'datasets': {'1000 Genomes': '10473108253681171589',
                   'Platinum Genomes': '3049512673186936334',
                   'DREAM SMC Challenge': '337315832689',
                   'PGP': '383928317087',
                   'Simons Foundation' : '461916304629'}
    }


class ApiException(Exception):
  pass


# Request handlers
class BaseRequestHandler(webapp2.RequestHandler):
  def handle_exception(self, exception, debug_mode):
    if isinstance(exception, ApiException):
      # ApiExceptions are expected, and will return nice error
      # messages to the client
      self.response.write(exception.message)
      self.response.set_status(400)
    else:
      # All other exceptions are unexpected and should be logged
      logging.exception('Unexpected exception')
      self.response.write('Unexpected internal exception')
      self.response.set_status(500)

  def get_backend(self):
    backend = self.request.get('backend')
    if not backend:
      raise ApiException('Backend parameter must be set')
    return backend

  def supports_name_filter(self):
    return SUPPORTED_BACKENDS[self.get_backend()].has_key('supportsNameFilter')

  def supports_partial_response(self):
    return SUPPORTED_BACKENDS[self.get_backend()]\
      .has_key('supportsPartialResponse')

  def get_base_api_url(self):
    return SUPPORTED_BACKENDS[self.get_backend()]['url']

  def get_content(self, path, method='POST', body=None, params=''):
    uri= self.get_base_api_url() % (path, params)
    startTime = time.clock()
    response, content = http.request(
      uri,
      method=method, body=json.dumps(body) if body else None,
      headers={'Content-Type': 'application/json; charset=UTF-8'})
    contentLen = len(content)

    try:
      content = json.loads(content)
    except ValueError:
      logging.error('while requesting {}'.format(uri))
      logging.error('non-json api content %s' % content[:1000])
      raise ApiException('The API returned invalid JSON')

    if response.status >= 300:
      logging.error('error api response %s' % response)
      logging.error('error api content %s' % content)
      if 'error' in content:
        raise ApiException(content['error']['message'])
      else:
        raise ApiException('Something went wrong with the API call!')

    logging.info('get_content {}: {}kb {}s'
                 .format(uri, contentLen/1024, time.clock() - startTime))
    return content

  def write_response(self, content):
    self.response.headers['Content-Type'] = "application/json"
    self.response.write(json.dumps(content))
    
  def write_content(self, path, method='POST', body=None, params=''):
    self.write_response(self.get_content(path, method, body, params))


class SetSearchHandler(BaseRequestHandler):

  def write_read_group_sets(self, dataset_id, name):
    self.write_content('readgroupsets/search',
                       body={'datasetIds': [dataset_id], 'name': name},
                       params='fields=readGroupSets(id,name)')

  def write_call_sets(self, dataset_id, name):
    variant_sets = self.get_content('variantsets/search',
                                    body={ 'datasetIds' : [dataset_id]})
    variant_set_id = variant_sets['variantSets'][0]['id']
    self.write_content('callsets/search',
                       body={'variantSetIds': [variant_set_id], 'name': name},
                       params='fields=callSets(id,name)')

  def write_read_group_set(self, set_id):
    set = self.get_content('readgroupsets/%s' % set_id, method='GET')
    # For read group sets, we also load up the reference set data
    reference_set_id = set.get('referenceSetId') or \
                       set['readGroups'][0].get('referenceSetId')

    if not reference_set_id:
      # TODO: Get coverage API added to GA4GH
      buckets = self.get_content('readgroupsets/%s/coveragebuckets' % set_id,
                                 method='GET')
      set['references'] = [{'name': b['range']['referenceName'],
                            'length': b['range']['end']}
                           for b in buckets['coverageBuckets']]
    else:
      # TODO: Get search by refSetId added to GA4GH
      references = self.get_content('references/search',
                                    body={'referenceSetId': [reference_set_id]},
                                    params='fields=references(name,length)')
      set['references'] = references['references']
    self.response.write(json.dumps(set))


  def write_call_set(self, set_id):
    set = self.get_content('callsets/%s' % set_id, method='GET')
    # For call sets, we also load up the variant set data to get
    # the available reference names and lengths
    variant_set_id = set['variantSetIds'][0]
    variant_set = self.get_content('variantsets/%s' % variant_set_id,
                               method="GET")

    # TODO: Get variantset.refSetId added to GA4GH
    set['references'] = [{'name': b['referenceName'],
                          'length': b['upperBound']}
                         for b in variant_set['referenceBounds']]
    self.response.write(json.dumps(set))

  def get(self):
    use_callsets = self.request.get('setType') == 'CALLSET'
    set_id = self.request.get('setId')
    if set_id:
      if use_callsets:
        self.write_call_set(set_id)
      else:
        self.write_read_group_set(set_id)
    else:
      dataset_id = self.request.get('datasetId')
      name = self.request.get('name')

      try:
        if use_callsets:
          self.write_call_sets(dataset_id, name)
        else:
          self.write_read_group_sets(dataset_id, name)
      except:
        self.response.write('{}')


class ReadSearchHandler(BaseRequestHandler):

  def get(self):
    body = {
      'readGroupSetIds': self.request.get('setIds').split(','),
      'referenceName': self.request.get('sequenceName'),
      'start': max(0, int(self.request.get('sequenceStart'))),
      'end': int(self.request.get('sequenceEnd')),
    }
    readFields = self.request.get('readFields')
    params = ''
    if readFields and self.supports_partial_response():
        params = 'fields=nextPageToken,alignments(%s)' % readFields
        body['pageSize'] = 1024
    pageToken = self.request.get('pageToken')
    if pageToken:
      body['pageToken'] = pageToken

    content = self.get_content('reads/search', body=body, params=params)

    # Emulate support for partial responses by supplying only the
    # requested fields to the client.
    if readFields and not self.supports_partial_response():
      fields = readFields.split(',')
      def filterKeys(dict, keys):
        return { key: dict[key] for key in keys }
      newReads = [ filterKeys(read, fields) for read in content['alignments']]
      content['alignments'] = newReads
      
    self.write_response(content)


class VariantSearchHandler(BaseRequestHandler):

  def get(self):
    body = {
      'callSetIds': self.request.get('setIds').split(','),
      'referenceName': self.request.get('sequenceName'),
      'start': max(0, int(self.request.get('sequenceStart'))),
      'end': int(self.request.get('sequenceEnd')),
      'pageSize': 100
    }
    pageToken = self.request.get('pageToken')
    if pageToken:
      body['pageToken'] = pageToken
    self.write_content('variants/search', body=body)


class BaseSnpediaHandler(webapp2.RequestHandler):
  def getSnppediaPageContent(self, snp):
    uri = "http://bots.snpedia.com/api.php?action=query&prop=revisions&" \
          "format=json&rvprop=content&titles=%s" % snp
    response, content = http.request(uri=uri)

    page_id, page = json.loads(content)['query']['pages'].popitem()
    return page['revisions'][0]['*']

  def getContentValue(self, content, key):
    try:
      matcher = '%s=(.*)\n' % key
      return re.search(matcher, content, re.I).group(1)
    except (KeyError, AttributeError):
      return ''

  def complement(self, base):
    return {'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G'}[base]


class SnpSearchHandler(BaseSnpediaHandler):

  def getSnpResponse(self, name, content):
    return {
      'name': name,
      'link': 'http://www.snpedia.com/index.php/%s' % name,
      'position': self.getContentValue(content, 'position'),
      'chr': self.getContentValue(content, 'chromosome')
    }

  def get(self):
    snp = self.request.get('snp')

    try:
      content = self.getSnppediaPageContent(snp)
      if snp[:2].lower() == 'rs':
        snps = [self.getSnpResponse(snp, content)]
      else:
        # Try a gene format
        snps = re.findall('\[\[(rs\d+?)\]\]', content, re.I)
        snps = [self.getSnpResponse(s, self.getSnppediaPageContent(s))
                for s in set(snps)]

    except (ValueError, KeyError, AttributeError):
      snps = []
    self.response.write(json.dumps({'snps' : snps}))


class AlleleSearchHandler(BaseSnpediaHandler):

  def getAlleleResponse(self, name, content):
    return {
      'name': name,
      'link': 'http://www.snpedia.com/index.php/%s' % name,
      'repute': self.getContentValue(content, 'repute'),
      'summary': self.getContentValue(content, 'summary') or 'Unknown',
      'magnitude': self.getContentValue(content, 'magnitude')
    }

  def get(self):
    snp = self.request.get('snp')
    a1 = self.request.get('a1')
    a2 = self.request.get('a2')

    a1c = self.complement(a1)
    a2c = self.complement(a2)
    possible_names = [(snp, a1, a2), (snp, a2, a1),
                      (snp, a1c, a2c), (snp, a2c, a1c)]
    for name in possible_names:
      try:
        page = "%s(%s;%s)" % name
        content = self.getSnppediaPageContent(page)
        self.response.write(json.dumps(self.getAlleleResponse(page, content)))
        return
      except (ValueError, KeyError, AttributeError):
        pass # Continue trying the next allele name

    self.response.write(json.dumps({}))


class MainHandler(webapp2.RequestHandler):

  def get(self):
    template = JINJA_ENVIRONMENT.get_template('main.html')
    self.response.write(template.render({
      'backends': SUPPORTED_BACKENDS,
    }))

web_app = webapp2.WSGIApplication(
    [
     ('/', MainHandler),
     ('/api/reads', ReadSearchHandler),
     ('/api/variants', VariantSearchHandler),
     ('/api/sets', SetSearchHandler),
     ('/api/snps', SnpSearchHandler),
     ('/api/alleles', AlleleSearchHandler),
    ],
    debug=True)
