/**
 * What a senior class's lesson writer is told about the three answers that hold several values (P150): a `list`, an `order` and a `table`. It is one bullet
 * of "What to write", placed after the bullet that tells the answer kinds (see `PROMPT_RULES.write_lesson`). Never given to a primary class.
 * `za` is true in South Africa, where a decimal is written with a comma (the key `5,5`); elsewhere the example is `5.5`.
 */
export const seniorLists = (za: boolean): string => {
  const half = za ? '5,5' : '5.5'
  return (
    'Three more answer kinds hold several values in one `answer`, written with a semicolon between the values (a comma is part of a decimal, so never cut a list at a comma). ' +
    `\`list\` (\`2; 4; ${half}; 8; 10\`): use it for a statistics summary (the mean, median and range; the five-number summary), the next terms of a sequence ("write the next three terms"), all the factors or multiples of a number, a set of outcomes or probabilities. ` +
    'Set `ordered` to true when the order matters (the next three terms) and to false when any order is right (all the factors of 24). When each value has a name (a five-number summary), give `labels`, one short label for each value, in the order of the answer: `["min", "Q1", "median", "Q3", "max"]`; labels fix the order. ' +
    `\`order\` (\`1/4; ${za ? '0,3' : '0.3'}; 1/2; ${za ? '0,6' : '0.6'}\`): the learner puts numbers, fractions or decimals in order; the \`answer\` is the items in the right order, between 2 and 8 of them, and the screen draws them as chips in a shuffled order. ` +
    'Say in the `prompt` which way (smallest first, or biggest first). ' +
    '`table` (a frequency table, a two-way table, the counts of a Venn diagram or a probability tree written as a table, a table of values x and y): give `table` with `columns` (the headings) and `rows` (each row has one entry for each column: the text that is given, or null for a cell the learner fills), at most 4 columns and 6 rows. ' +
    'The `answer` holds the values of the null cells, left to right and top to bottom, so it has exactly as many values as the table has nulls. ' +
    'Every value is a number, a fraction or an expression (`7`, `1/2`, `√8`), except in a table of outcomes (a coin and a die): its `columns` are `["Die", "H", "T"]`, each row starts with a number of the die (`["1", "H1", null]`), ' +
    'and each null cell holds its column and its row put together in capitals (`T1; T2; H3; T3`). ' +
    'When the question asks for a rounded answer ("correct to 1 decimal place"), set `round` to the number of decimal places (1) and write the exact value in the `answer`. ' +
    'Use these kinds only for the 15 questions, never in the warm-up, and never for a question with one number as its answer.'
  )
}
