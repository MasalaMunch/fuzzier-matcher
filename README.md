# FuzzierMatcher

A string matching algorithm inspired by Forrest Smith's [fuzzy match](https://blog.forrestthewoods.com/reverse-engineering-sublime-text-s-fuzzy-match-4cffeed33fdb).

## What makes it fuzzier?

* Typos don't prevent a strong match. For example, `vrockhampton` will match strongly with `brockhampton`.
* Incorrect word orderings don't prevent a strong match. For example, `honey brockhampton` will match strongly with `brockhampton honey`.


## How does it work?

* To determine the similarity of two words, such as `("toon", "bono")`, it pairs indices that contain the same character in a way that minimizes distance, such as `((1, 1), (2, 3), (3, 2))`. Each pair receives a similarity score ∈ (0, 1], such as `(4/4, 3/4, 3/4)`. The scores are then summed, producing a similarity score of `2.5` for `("toon", "bono")`. This process takes O(nlogm) time and O(m+n) space, where m and n are the minimum and maximum lengths of the two words.
* To determine the similarity of two strings, such as `("toon bono", " rono foon")`, it creates two word lists, such as `(("toon, bono"), ("rono", "foon"))`, and pairs words in a way that maximizes the sum of the pairings' similarity scores, such as `((0, 1), (1, 0))`, with words whose indices are similar, such as `("toon", "rono")`, receiving a slight score bonus. This process takes O(nmlogm) time and O(nm) space, where m and n are the minimum and maximum word counts of the two strings.

## How fast is it?

* The JavaScript implementation can query up to 10,000 5-word strings (&#126;500,000 characters) in real time on [my laptop](https://browser.geekbench.com/macs/437).

## Demo

* [queueshare.com/FuzzierMatcherDemo/play](https://queueshare.com/FuzzierMatcherDemo/play)
* I've realized the demo is slow not because of the matching algorithm, but because it draws too many results onto the screen. This will be fixed in the next QueueShare update.

## Basic Usage

```
>>> fuzzierMatcher = FuzzierMatcher()
>>> fuzzierMatcher.setQuery("search query")
>>> fuzzierMatcher.getScore("Target of Search")
7.5344827586206895
>>> fuzzierMatcher.getIndices("Target of Search")
[4, 2, 10, 11, 12, 13, 14, 15]
>>> fuzzierMatcher.delete("Target of Search")
```

## API

`FuzzierMatcher([WordList, WordStr, WordSrcIndicesList]) -> fuzzierMatcher`

* The optional parameters allow you to customize the preprocessing of strings. By default, strings are converted to lowercase and split by whitespace (see `DefaultWordList`, `DefaultWordStr`, and `DefaultWordSrcIndicesList` in the source code). When customizing, 
    * `WordList` must be a `(string) -> stringArray` function.
    * `WordStr` must be a `(stringArray) -> string` function. It will be used to serialize the output of `WordList`.
    * `WordSrcIndicesList` must be a `(string, stringArray) -> intArrayArray` function. It will be used if you call `getIndices`. It can be thought of as a way to map the output of a `WordList` call back onto its input string. For example, `DefaultWordSrcIndicesList(" My String", ["my", "string"])` returns `[[1, 2], [4, 5, 6, 7, 8, 9]]`.

`fuzzierMatcher.setQuery(queryString)`

* For example, if the user types `Some words` in the search box, you'll want to use `setQuery("Some words")`. 
* Performance-wise, this method is "smart," in that if the previous query was `Some word`, it will detect that only one word has changed (`word` -> `words`) and update the cache accordingly.

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