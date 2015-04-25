#!/bin/bash
OUTPUT_FILE=$(readlink -f ../../../../ex1_deduped_picard_cigar_api.bam)
METRICS_FILE=$(readlink -f ../../../../ex1_deduped_picard_cigar_api.metrics)

./run_picard.sh \
MarkDuplicatesWithMateCigar \
INPUT=https://www.googleapis.com/genomics/v1beta2/readgroupsets/CK256frpGBD44IWHwLP22R4/ \
OUTPUT=$OUTPUT_FILE \
METRICS_FILE=$METRICS_FILE
