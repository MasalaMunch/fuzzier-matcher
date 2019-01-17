# FuzzierMatcher

A string matching algorithm inspired by Forrest Smith's [fuzzy match](https://blog.forrestthewoods.com/reverse-engineering-sublime-text-s-fuzzy-match-4cffeed33fdb).

## What makes it fuzzier?

* Typos don't prevent a strong match. For example, `vrockhampton` will match strongly with `brockhampton`.
* Incorrect word orderings don't prevent a strong match. For example, `honey brockhampton` will match strongly with `brockhampton honey`.

## How fast is it?

* The JavaScript implementation can query databases containing up to 500,000 characters in real time on [my laptop](https://browser.geekbench.com/macs/437).

## Demo

1. Go to [queueshare.com/FuzzierMatcherDemo](https://queueshare.com/FuzzierMatcherDemo).
2. Click the search icon.
3. Type.

## Basic Usage

```
>>> fuzzierMatcher = FuzzierMatcher()
>>> fuzzierMatcher.setQuery("search query")
>>> fuzzierMatcher.getScore("Target of Search")
51.66666666666667
>>> fuzzierMatcher.getIndices("Target of Search")
[4, 2, 10, 11, 12, 13, 14, 15]
>>> fuzzierMatcher.delete("Target of Search")
```

## API

`FuzzierMatcher([WordList, WordStr, WordSrcIndicesList]) -> fuzzierMatcher`

* The optional parameters allow you to customize the preprocessing of strings. By default, strings are converted to lowercase and split by whitespace (see `DefaultWordList`, `DefaultWordStr`, and `DefaultWordSrcIndicesList` in the source code). When customizing, 
    * `WordList` must be a `(string) -> stringArray` function.
    * `WordStr` must be a `(stringArray) -> string` function. It will be used to serialize the output of `WordList`.
    * `WordSrcIndicesList` must be a `(string, stringArray) -> intArrayArray` function. It will be used if you call `fuzzierMatcher.getIndices`. It can be thought of as a way to map the output of a `WordList` call back onto its input string. For example, `DefaultWordSrcIndicesList(" My string", ["my", "string"])` returns `[[1, 2], [4, 5, 6, 7, 8, 9]]`.

`fuzzierMatcher.setQuery(queryString)`

* For example, if the user types `Go fuck a duck` in the search box, you'll want to use `setQuery("Go fuck a duck")`. 
* Performance-wise, this method is "smart," in that if the previous query is `Go fuck a duc`, it will detect that only one word has changed (`duc` -> `duck`) and update the cache accordingly.

`fuzzierMatcher.getScore(targetString) -> float`

* Scores can be used to generate a ranked list of search targets. In the demo, this is done by building a max-heap of targets based on score and removing the 10 strongest matches from it.
* Scores are cached, so calling `getScore` on the same `targetString` multiple times will not recompute the score unless `setQuery` is called in the interim.

`fuzzierMatcher.getIndices(targetString) -> intArray`

* In the demo, this is called on the 10 strongest-matching target strings in order to highlight which of their letters match the query string.
* Indices are cached in a manner similar to `getScore`.

`fuzzierMatcher.getAsyncWorker(iterator, processItem, onFinish, [targetFps]) -> asyncWorker`

* This method is useful for searching large databases. For example, `getAsyncWorker(stringArray.values(), fuzzierMatcher.getScore, showTopResults).start()` will asyncronously cache the score of every item in `stringArray`, then call `showTopResults`. The default value for `targetFps` is 144.
* The `asyncWorker` object exposes the self-explanatory `start()` and `stop()` methods along with the `finish()` method, which causes it to syncronously process its remaining items.

`fuzzierMatcher.delete(targetString)`

* This method is used to prune the cache. If you know a `targetString` has been removed from your database, use `delete(targetString)` to remove its corresponding objects from the cache.

`fuzzierMatcher.clear()`

* This method clears the entire cache.