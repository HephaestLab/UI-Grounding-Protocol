#!/usr/bin/env Rscript

# Confirmatory mixed-effects analysis. Run only on a complete, sealed primary
# dataset after readiness.json reports confirmatoryExperimentRunnable=true.

suppressPackageStartupMessages({
  library(lme4)
  library(emmeans)
  library(readr)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) {
  stop("usage: Rscript analysis/model.R <episodes.csv> <output.json>")
}

episodes <- read_csv(args[[1]], show_col_types = FALSE)
required <- c(
  "strictSuccess", "groundingMethod", "model", "taskFamily",
  "taskOpaqueId", "domain", "replicate"
)
missing <- setdiff(required, names(episodes))
if (length(missing) > 0) {
  stop(paste("missing columns:", paste(missing, collapse = ", ")))
}

episodes$groundingMethod <- factor(episodes$groundingMethod)
episodes$model <- factor(episodes$model)
episodes$taskFamily <- factor(episodes$taskFamily)
episodes$taskOpaqueId <- factor(episodes$taskOpaqueId)
episodes$domain <- factor(episodes$domain)
episodes$replicate <- factor(episodes$replicate)
episodes <- subset(episodes, replicate == levels(replicate)[1])

fit <- glmer(
  strictSuccess ~ groundingMethod * model * taskFamily +
    (1 | taskOpaqueId) + (1 | domain),
  data = episodes,
  family = binomial(link = "logit"),
  control = glmerControl(optimizer = "bobyqa")
)

contrasts <- contrast(
  emmeans(fit, ~ groundingMethod | model * taskFamily, type = "response"),
  method = "trt.vs.ctrl",
  ref = which(levels(episodes$groundingMethod) == "ugp"),
  adjust = "holm"
)

result <- list(
  formula = deparse(formula(fit)),
  converged = is.null(fit@optinfo$conv$lme4$messages),
  fixed_effects = as.data.frame(summary(fit)$coefficients),
  ugp_contrasts = as.data.frame(summary(contrasts, infer = c(TRUE, TRUE)))
)
write_json(result, args[[2]], pretty = TRUE, auto_unbox = TRUE, na = "null")
