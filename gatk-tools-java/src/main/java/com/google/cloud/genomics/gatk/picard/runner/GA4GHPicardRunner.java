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
package com.google.cloud.genomics.gatk.picard.runner;

import com.google.cloud.genomics.gatk.common.GA4GHUrl;
import com.google.cloud.genomics.gatk.common.GenomicsApiDataSourceFactory;
import com.google.cloud.genomics.gatk.common.GenomicsApiDataSourceFactory.Settings;
import com.google.cloud.genomics.gatk.common.ReadIteratorResource;

import com.beust.jcommander.JCommander;
import com.beust.jcommander.Parameter;
import com.beust.jcommander.Parameters;

import htsjdk.samtools.SamReader;
import htsjdk.samtools.SamReaderFactory;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URISyntaxException;
import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

/**
 * Main class for running Picard tools with INPUTS using ga4gh:// urls.
 */
@Parameters(separators = "=")
public class GA4GHPicardRunner {
  private static final Logger LOG = Logger.getLogger(GA4GHPicardRunner.class.getName());
  @Parameter(names = "--root_url",
      description = "set the Genomics API root URL",
      hidden = true)
  public String rootUrl = "https://www.googleapis.com/genomics/v1beta2";

  @Parameter(names = "--nolocalserver",
      description = "Disable the starting up of a local server for the auth flows",
      hidden = true)
  public boolean noLocalServer = false;

  @Parameter(names = "--client_secrets_filename",
      description = "Path to client_secrets.json")
  public String clientSecretsFilename = "client_secrets.json";
  
  @Parameter(names = "-path",
      description = "Path to picard tools binaries")
  public String picardPath = "picard/dist";
  
  @Parameter(names = "-tool",
      required= true,
      description = "Name of the Picard tool to run")
  public String picardTool = "";
  
  @Parameter(names = "-jvm_args",
      description = "JVM args for Picard tool run")
  public String picardJVMArgs = "-Xmx4g";
   
  // TODO(iliat): support multiple inputs
  @Parameter(description = 
      "Picard tool parameters, INPUT(s) can be files or GA4GH urls.")
  public List<String> picardArgs = new ArrayList<String>();
  
  @Parameter(names = "-pipeFiles",
      description = "Pipe local files too")
  public Boolean pipeFiles = true;
  
  static String INPUT_PREFIX = "INPUT=";
  
  static String STDIN_FILE_NAME = "/dev/stdin";
  
  /** Cmd line arguments array for Picard tool invocation */
  private ArrayList<String> command = new ArrayList<String>();
  
  /** List of INPUT=... parameters to process and potentially pipe through */
  private ArrayList<Input> inputs = new ArrayList<Input>();
  
  /** Picard process */
  private Process process;
  
  /** Factory for creating Genomics Api based data sources */
  private GenomicsApiDataSourceFactory factory = new GenomicsApiDataSourceFactory();
  
  /**
   * Holds all relevant data for one input resource.
   */
  @SuppressWarnings("unused")
  private static class Input {
    public Input(String resource, String pipeName, SAMFilePump pump) {
      super();
      this.resource = resource;
      this.pipeName = pipeName;
      this.pump = pump;
    }
    
    public String getResource() {
      return resource;
    }
    public void setResource(String resource) {
      this.resource = resource;
    }
    public String getPipeName() {
      return pipeName;
    }
    public void setPipeName(String pipeName) {
      this.pipeName = pipeName;
    }
    public SAMFilePump getPump() {
      return pump;
    }
    public void setPump(SAMFilePump pump) {
      this.pump = pump;
    }
    private String resource;
    private String pipeName;
    private SAMFilePump pump;
  }
  
  /** Runs the program */
  public static void main(String[] args) {
    (new GA4GHPicardRunner()).run(args);
  }
  
  /** Trivial constructor */
  public GA4GHPicardRunner() {
  }
  
  /** Sets up required streams and pipes and then spawns the Picard tool */
  public void run(String[] args) {
    LOG.info("Starting GA4GHPicardRunner");
    try {
      parseCmdLine(args);
      buildPicardCommand();
      startProcess();
      pumpInputData();
      waitForProcessEnd();
    } catch (Exception e) {
      System.out.println(e.getMessage());
      e.printStackTrace();
    }
  }
  
  /** Parses cmd line with JCommander */
  void parseCmdLine(String[] args) {
    JCommander parser = new JCommander(this, args);
    parser.setProgramName("GA4GHPicardRunner");
    LOG.info("Cmd line parsed");
  }
  
  /** 
   * Adds relevant parts to the cmd line for Picard tool, finds and extracts
   * "INPUT=" arguments and processes them by creating appropriate data pumps.
   */
  private void buildPicardCommand() 
      throws IOException, GeneralSecurityException, URISyntaxException {
    File picardJarPath = new File(picardPath, "picard.jar");
    if (!picardJarPath.exists()) {
      throw new IOException("Picard tool not found at " + 
          picardJarPath.getAbsolutePath());
    }
    
    command.add("java");
    command.add(picardJVMArgs);
    command.add("-jar");
    command.add(picardJarPath.getAbsolutePath());
    command.add(picardTool);
    
    for (String picardArg : picardArgs) {
      if (picardArg.startsWith(INPUT_PREFIX)) {
        String inputPath = picardArg.substring(INPUT_PREFIX.length());
        inputs.add(processInput(inputPath));
      } else {
        command.add(picardArg);
      }
    }
    for (Input input : inputs) {
      command.add("INPUT=" + input.pipeName);
    }
  }
  
  private Input processInput(String input) throws IOException, GeneralSecurityException, URISyntaxException {    
    if (GA4GHUrl.isGA4GHUrl(input)) {
      return processGA4GHInput(input);
    } else {
      return processRegularFileInput(input);
    }
  }
  
  /** Processes GA4GH based input, creates required API connections and data pump */
  private Input processGA4GHInput(String input) throws IOException, GeneralSecurityException, URISyntaxException {
    GA4GHUrl url = new GA4GHUrl(input);
    factory.configure(url.getRootUrl(), 
        new Settings(clientSecretsFilename, noLocalServer));
    ReadIteratorResource reads = factory
        .get(url.getRootUrl())
        .getReadsFromGenomicsApi(url);
    return new Input(input, STDIN_FILE_NAME, 
        new ReadIteratorToSAMFilePump(reads));
  }
  
  /** Processes regular, non GA4GH based file input */
  private Input processRegularFileInput(String input) throws IOException {
    File inputFile = new File(input);
    if (!inputFile.exists()) {
      throw new IOException("Input does not exist: " + input);
    }
    if (pipeFiles) {
      SamReader samReader = SamReaderFactory.makeDefault().open(inputFile);
      return new Input(input, STDIN_FILE_NAME, 
          new SamReaderToSAMFilePump(samReader)); 
    } else {
      return new Input(input, input, null);
    }
  }
  
  /**
   * Starts the Picard tool process based on constructed command.
   * @throws IOException
   */
  private void startProcess() throws IOException {
    LOG.info("Building process");
    ProcessBuilder processBuilder = new ProcessBuilder(command);
    processBuilder.redirectError(ProcessBuilder.Redirect.INHERIT);
    processBuilder.redirectOutput(ProcessBuilder.Redirect.INHERIT);
 
    LOG.info("Starting process");
    process = processBuilder.start();
    LOG.info("Process started");
  }
  
  /**
   * Loops through inputs and for each, pumps the data into the proper pipe 
   * stream connected to the executing process.
   * @throws IOException
   */
  private void pumpInputData() throws IOException {
    for (Input input : inputs) {
      if (input.pump == null) {
        continue;
      }
      OutputStream os;
      if (input.pipeName.equals(STDIN_FILE_NAME)) {
        os = process.getOutputStream();
      } else {
        throw new IOException("Only stdin piping is supported so far.");
      }
      input.pump.pump(os);
    }
  }
  
  private void waitForProcessEnd() throws InterruptedException, Exception {
    if (process.waitFor() != 0 || process.exitValue() != 0) {
      throw new Exception("Picard tool run failed, exit value=" + 
          process.exitValue());
    }
    
    LOG.info("Process finished");
  }
}
