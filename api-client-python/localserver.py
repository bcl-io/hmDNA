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

This file allows users to run the python client without using app engine.
"""
from paste import httpserver
from paste.cascade import Cascade
from webob.static import DirectoryApp
from main import web_app

def main():
  static_app = DirectoryApp(".", index_page=None)

  # Create a cascade that looks for static files first, then tries the webapp
  app = Cascade([static_app, web_app])
  httpserver.serve(app, host='127.0.0.1', port='8080')

if __name__ == '__main__':
  main()