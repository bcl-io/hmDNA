/*
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
*/
package com.google.cloud.genomics.gatk.common;

import java.util.HashMap;
import java.util.Map;

/**
 * Creates GenomicsApiDataSource objects, one per each root url
 * (e.g. https://www.googleapis.com/genomics/v1beta2).
 * Allows configuring settings such as client secrets file on a per 
 * root url basis.
 */
public class GenomicsApiDataSourceFactory {
  /**
   * Settings required for initializing GenomicsApiDataSource
   */
  public static class Settings {
    public Settings() {
      clientSecretsFile = "";
      noLocalServer = false;
    }
    public Settings(String clientSecretsFile, boolean noLocalServer) {
      this.clientSecretsFile = clientSecretsFile;
      this.noLocalServer = noLocalServer;
    }
    public String clientSecretsFile;
    public boolean noLocalServer;
  }
  
  /**
   * A pair of settings and the corresponding initialized data source.
   */
  private static class Data {
    public Data(Settings settings, GenomicsApiDataSource dataSource) {
      this.settings = settings;
      this.dataSource = dataSource;
    }
    public Settings settings;
    public GenomicsApiDataSource dataSource;
  }
  
  private Map<String, Data> dataSources = new HashMap<String, Data>();
  
  /**
   * Sets the settings for a given root url, that will be used for creating
   * the data source. Has no effect if the data source has already been created.
   */
  public void configure(String rootUrl, Settings settings) {
    Data data = dataSources.get(rootUrl);
    if (data == null) {
      data = new Data(settings, null);
      dataSources.put(rootUrl, data);
    } else {
      data.settings = settings;
    }
  }
 
  /**
   * Lazily creates and returns the data source for a given root url.
   */
  public GenomicsApiDataSource get(String rootUrl) {
    Data data = dataSources.get(rootUrl);
    if (data == null) {
      data = new Data(new Settings(), null);
      dataSources.put(rootUrl, data);
    }
    if (data.dataSource == null) {
      data.dataSource = new GenomicsApiDataSource(rootUrl,
          data.settings.clientSecretsFile, data.settings.noLocalServer);
    }
    return data.dataSource;
  }
  
  public GenomicsApiDataSourceFactory() {
  }
}
