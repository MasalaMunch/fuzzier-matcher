const FuzzierMatcher = (() => {

    const MultiSet = () => {
        const This = new Map();
        This.get = (item) => {
            const itemCount = Map.prototype.get.call(This, item);
            return itemCount === undefined? 0 : itemCount;
        };
        This.push = (item) => This.set(item, This.get(item)+1);
        This.pop = (item) => {
            const itemCount = This.get(item)-1;
            if (itemCount < 1) {
                This.delete(item);
                return 0;
            }
            This.set(item, itemCount);
            return itemCount;
        };
        return This;
    };

    const LazyMap = (getValFromKey) => {
        const This = new Map();
        This.get = (key) => {
            let val = Map.prototype.get.call(This, key);
            if (val === undefined) {
                val = getValFromKey(key);
                This.set(key, val);
            }
            return val;
        };
        return This;
    };

    const CharMap = (() => {
        const BlankArray = () => [];
        return (str) => {
            const This = LazyMap(BlankArray);
            for (let i=0; i<str.length; i++) {
                This.get(str.charCodeAt(i)).push(i);
            }
            return This;
        };
    })();

    const MaxHeap = (compareItems, array) => {

        const fixChildren = (i, item) => {
            while (true) {
                const iLeftChild = (i<<1) + 1;
                if (iLeftChild < array.length) {
                    const leftChildItem = array[iLeftChild];
                    let iMaxChild;
                    let maxChildItem;
                    const iRightChild = iLeftChild + 1;
                    if (iRightChild < array.length) {
                        const rightChildItem = array[iRightChild];
                        if (compareItems(rightChildItem, leftChildItem) > 0) {
                            iMaxChild = iRightChild;
                            maxChildItem = rightChildItem;
                        } else {
                            iMaxChild = iLeftChild;
                            maxChildItem = leftChildItem;
                        }
                    } else {
                        iMaxChild = iLeftChild;
                        maxChildItem = leftChildItem;
                    }
                    if (compareItems(maxChildItem, item) > 0) {
                        array[i] = maxChildItem;
                        i = iMaxChild;
                    } else {
                        break;
                    }               
                } else {
                    break;
                }
            }
            array[i] = item;
        };

        return {
            addAsMin: (item) => array.push(item),
            fix: () => {
                for (let i=(array.length-2)>>1; i>=0; i--) {
                    fixChildren(i, array[i]);
                }
            },
            getMax: () => array[0],
            delMax: () => fixChildren(0, array.pop()),
            };

    };

    const ArrayAllocator = () => {
        const freeArrays = [];
        const inUseArrays = [];
        return {
            get: (len=0) => {
                const array = freeArrays.length === 0? [] : freeArrays.pop();
                array.length = len;
                array.fill();
                inUseArrays.push(array);
                return array;
            },
            release: () => {
                for (let i=inUseArrays.length-1; i>=0; i--) {
                    freeArrays.push(inUseArrays.pop());
                }
            },
            clear: () => freeArrays.length = 0,
            };
    };

    const SimilarityScore = (differenceScore) => {
        return 1 / (1 + Math.abs(differenceScore));
    };

    const DumbWordList = (srcStr) => [srcStr];
    const DumbWordStr = (wordList) => wordList.join("");
    const DumbWordSrcIndicesList = (() => {
        const Range = (len) => {
            const This = new Array(len);
            for (let i=0; i<len; i++) {
                This[i] = i;
            }
            return This;
        };
        return (srcStr, wordList) => [Range(srcStr.length)];
    })();

    const DefaultWordList = (srcStr) => {
        const match = srcStr.toLowerCase().match(/[^\s]+/g);
        return match === null? [] : match;
    };
    const DefaultWordStr = (wordList) => wordList.join(" ");
    const DefaultWordSrcIndicesList = (srcStr, wordList) => {
        This = new Array(wordList.length);
        if (wordList.length > 0) {
            let iSrc = 0;
            let iDst = 0;
            while (true) {
                if (srcStr.charCodeAt(iSrc) === wordList[iDst].charCodeAt(0)) {
                    This[iDst] = new Array(wordList[iDst].length);
                    for (let iWord=0; iWord<wordList[iDst].length; iWord++) {
                        This[iDst][iWord] = iSrc++;
                    }
                    if (++iDst === wordList.length) {
                        break;
                    }
                } else {
                    ++iSrc;
                }
            }
        }
        return This;
    };

    return (WordList=DefaultWordList, WordStr=DefaultWordStr, 
            WordSrcIndicesList=DefaultWordSrcIndicesList) => {

        const arrayAllocator = ArrayAllocator();

        const getWordStrMatchScore = (targetWordStr, 
                                      getWordMatchedIndicesListInstead) => {

            const targetWordList = targetWordStrWordLists.get(targetWordStr);

            const bigWordList = (
                queryWordList.length > targetWordList.length? 
                queryWordList : targetWordList
                );
            const smallWordList = (
                bigWordList === queryWordList? targetWordList : queryWordList
                );

            const smallHeapList = arrayAllocator.get(smallWordList.length);
            const smallScoresList = arrayAllocator.get(smallWordList.length); 
            const unpairedSmallListIndices = arrayAllocator.get(
                smallWordList.length
                );
            for (let i=0; i<smallWordList.length; i++) {
                unpairedSmallListIndices[i] = i;
                const scores = arrayAllocator.get(bigWordList.length);
                const heap = MaxHeap(
                    (iBig, jBig) => scores[iBig] - scores[jBig],
                    arrayAllocator.get(),
                    );
                for (let j=0; j<bigWordList.length; j++) {
                    scores[j] = (
                        similarityScores.get(i - j) 
                        + (
                            bigWordList === queryWordList? 
                            queryWordMatchScoreMaps.get(bigWordList[j])
                                .get(smallWordList[i])
                            : queryWordMatchScoreMaps.get(smallWordList[i])
                                .get(bigWordList[j])
                          )
                        );
                    heap.addAsMin(j);
                }
                smallScoresList[i] = scores;
                heap.fix();
                smallHeapList[i] = heap;
            }
            const smallBigIndexList = arrayAllocator.get(smallWordList.length);
            const bigSmallIndexList = arrayAllocator.get(bigWordList.length);
            while (unpairedSmallListIndices.length > 0) {
                const i = unpairedSmallListIndices.pop();
                while (true) {
                    const j = smallHeapList[i].getMax();
                    const iConflict = bigSmallIndexList[j];
                    if (iConflict === undefined || smallScoresList[i][j] 
                    > smallScoresList[iConflict][j]) {
                        smallBigIndexList[i] = j;
                        bigSmallIndexList[j] = i;
                        if (iConflict !== undefined) {
                            smallHeapList[iConflict].delMax();
                            unpairedSmallListIndices.push(iConflict);
                        }
                        break;
                    }
                    smallHeapList[i].delMax();
                }
            }

            arrayAllocator.release();

            if (getWordMatchedIndicesListInstead) {
                if (bigWordList === queryWordList) {
                    const targetWordMatchedIndicesList = (
                        new Array(smallWordList.length)
                        );
                    for (let i=0; i<smallBigIndexList.length; i++) {
                        targetWordMatchedIndicesList[i] = (
                            queryWordMatchedTargetIndicesMaps
                                .get(bigWordList[smallBigIndexList[i]])
                                    .get(smallWordList[i])
                            );
                    }
                    return targetWordMatchedIndicesList;
                }
                const targetWordMatchedIndicesList = (
                    new Array(bigWordList.length)
                    );
                for (let i=0; i<smallBigIndexList.length; i++) {
                    const j = smallBigIndexList[i];
                    targetWordMatchedIndicesList[j] = (
                        queryWordMatchedTargetIndicesMaps.get(smallWordList[i])
                            .get(bigWordList[j])
                        );
                }
                return targetWordMatchedIndicesList;
            }

            let matchScore = similarityScores.get(
                bigWordList.length - smallWordList.length
                );
            for (let i=0; i<smallBigIndexList.length; i++) {
                matchScore += smallScoresList[i][smallBigIndexList[i]];
            }
            return matchScore;

        };
        const targetWordStrMatchScores = LazyMap((wordStr) => {
            return getWordStrMatchScore(wordStr);
        });
        const targetWordStrWordMatchedIndicesLists = LazyMap((wordStr) => {
            return getWordStrMatchScore(wordStr, true);
        });

        const queryWordCharIndicesLists = new Map();
        const queryWordCharLists = LazyMap((word) => {
            const charMap = CharMap(word);
            const charList = new Array(charMap.size);
            const charIndicesList = new Array(charMap.size);
            let i = 0;
            for (const char of charMap.keys()) {
                charList[i] = char;
                charIndicesList[i] = charMap.get(char);
                ++i;
            }
            queryWordCharIndicesLists.set(word, charIndicesList);
            return charList;
        })

        const getWordMatchScore = (queryWord, targetWord, 
                                   getMatchedTargetIndicesInstead) => {

            const queryCharList = queryWordCharLists.get(queryWord);
            const queryCharIndicesList = (
                queryWordCharIndicesLists.get(queryWord)
                );
            const targetCharMap = targetWordCharMaps.get(targetWord);

            if (getMatchedTargetIndicesInstead) {
                var matchedTargetIndices = [];
            } else {
                var matchScore = (
                    similarityScores.get(targetWord.length - queryWord.length)
                    );
            }

            let remainingTargetIndices = targetWord.length;

            for (let i=0; i<queryCharList.length; i++) {
                const targetIndices = targetCharMap.get(queryCharList[i]);
                if (targetIndices !== undefined) {
                    const queryIndices = queryCharIndicesList[i];
                    const moreIndices = (
                        queryIndices.length > targetIndices.length?
                        queryIndices : targetIndices
                        );
                    const lessIndices = (
                        moreIndices === queryIndices?
                        targetIndices : queryIndices 
                        );
                    let iMin = 0;
                    for (let j=0; j<lessIndices.length; j++) {
                        const lessIndex = lessIndices[j];
                        const iMaxCache = (
                            moreIndices.length - lessIndices.length + j
                            );
                        let iMax = iMaxCache;
                        const iMinCache = iMin;
                        let moreIndex;
                        while (iMax >= iMin) {
                            const iTest = iMin + ((iMax-iMin)>>1);
                            const testIndex = moreIndices[iTest];
                            if (lessIndex > testIndex) {
                                iMin = iTest+1;
                            } else if (lessIndex < testIndex) {
                                iMax = iTest-1;
                            } else { // lessIndex === testIndex
                                moreIndex = testIndex;
                                iMin = iTest+1;
                                break;
                            }
                        }
                        if (moreIndex === undefined) {
                            if (iMin > iMaxCache) {
                                moreIndex = moreIndices[iMax];
                            } else if (iMax < iMinCache) {
                                moreIndex = moreIndices[iMin++];
                            } else {
                                const iMinIndex = moreIndices[iMin];
                                const iMaxIndex = moreIndices[iMax];
                                if (Math.abs(iMinIndex - lessIndex) 
                                < Math.abs(lessIndex - iMaxIndex)) {
                                    moreIndex = iMinIndex;
                                    ++iMin;
                                } else {
                                    moreIndex = iMaxIndex;
                                }
                            }
                        }
                        if (getMatchedTargetIndicesInstead) {
                            matchedTargetIndices.push(
                                moreIndices === queryIndices? 
                                lessIndex : moreIndex
                                );                              
                        } else {
                            matchScore += (
                                similarityScores.get(moreIndex - lessIndex)
                                );                          
                        }
                    }
                    if ((remainingTargetIndices -= targetIndices.length) 
                    === 0) {
                        break;
                    }
                }
            }
            if (getMatchedTargetIndicesInstead) {
                return matchedTargetIndices;
            }
            return matchScore;

        };
        const queryWordMatchScoreMaps = LazyMap((queryWord) => {
            return LazyMap((targetWord) => {
                return getWordMatchScore(queryWord, targetWord);
            });
        });
        const queryWordMatchedTargetIndicesMaps = LazyMap((queryWord) => {
            return LazyMap((targetWord) => {
                return getWordMatchScore(queryWord, targetWord, true);
            });
        });

        const targetStrMatchedIndices = LazyMap((str) => {
            const matchedIndices = [];
            const wordSrcIndicesList = targetStrWordSrcIndicesLists.get(str);
            const wordMatchedIndicesList = targetWordStrWordMatchedIndicesLists
                .get(targetStrWordStrs.get(str));
            for (let i=0; i<wordMatchedIndicesList.length; i++) {
                const matchedWordIndices = wordMatchedIndicesList[i];
                if (matchedWordIndices !== undefined) {
                    for (let j=0; j<matchedWordIndices.length; j++) {
                        matchedIndices.push(
                            wordSrcIndicesList[i][matchedWordIndices[j]]
                            );
                    }
                }
            }
            return matchedIndices;
        });

        const targetWordStrMultiSet = MultiSet();
        const targetWordMultiSet = MultiSet();

        let queryWordList = [];
        const queryWordMultiSet = MultiSet();

        const targetWordCharMaps = LazyMap(CharMap);
        const similarityScores = LazyMap(SimilarityScore);
        const targetWordStrWordLists = new Map();
        const targetStrWordStrs = LazyMap((str) => {
            const wordList = WordList(str);
            const wordStr = WordStr(wordList);
            targetWordStrWordLists.set(wordStr, wordList);
            for (let i=0; i<wordList.length; i++) {
                targetWordMultiSet.push(wordList[i]);
            }
            targetWordStrMultiSet.push(wordStr);
            return wordStr;
        });
        const targetStrWordSrcIndicesLists = LazyMap((str) => {
            return WordSrcIndicesList(
                str, targetWordStrWordLists.get(targetStrWordStrs.get(str))
                );
        });

        return {
            setQuery: (str) => {
                targetStrMatchedIndices.clear();
                targetWordStrMatchScores.clear();
                targetWordStrWordMatchedIndicesLists.clear();
                const newQueryWordList = WordList(str);
                for (let i=0; i<newQueryWordList.length; i++) {
                    queryWordMultiSet.push(newQueryWordList[i]);
                }
                for (let i=0; i<queryWordList.length; i++) {
                    const word = queryWordList[i];
                    if (queryWordMultiSet.pop(word) === 0) {
                        queryWordCharLists.delete(word);
                        queryWordCharIndicesLists.delete(word);
                        queryWordMatchScoreMaps.delete(word);
                        queryWordMatchedTargetIndicesMaps.delete(word);
                    }
                }
                queryWordList = newQueryWordList;
            },
            getScore: (targetStr) => {
                return targetWordStrMatchScores
                    .get(targetStrWordStrs.get(targetStr));
            },
            getIndices: (targetStr) => {
                return targetStrMatchedIndices.get(targetStr);
            },
            delete: (targetStr) => {
                targetStrMatchedIndices.delete(targetStr);
                targetStrWordSrcIndicesLists.delete(targetStr);
                if (targetStrWordStrs.has(targetStr)) {
                    const wordStr = targetStrWordStrs.get(targetStr);
                    targetStrWordStrs.delete(targetStr);
                    if (targetWordStrMultiSet.pop(wordStr) === 0) {
                        targetWordStrMatchScores.delete(wordStr);
                        targetWordStrWordMatchedIndicesLists.delete(wordStr);
                    }
                    const wordList = targetWordStrWordLists.get(wordStr);
                    targetWordStrWordLists.delete(wordStr);
                    for (let i=0; i<wordList.length; i++) {
                        const word = wordList[i];
                        if (targetWordMultiSet.pop(word) === 0) {
                            for (const scoreMap of 
                            queryWordMatchScoreMaps.values()) {
                                scoreMap.delete(word);
                            }
                            for (const matchedTargetIndicesMap of 
                            queryWordMatchedTargetIndicesMaps.values()) {
                                matchedTargetIndicesMap.delete(word);   
                            }
                            targetWordCharMaps.delete(word);
                        }
                    }
                }
            },
            clear: () => {
                arrayAllocator.clear();
                targetWordMultiSet.clear();
                targetWordStrMultiSet.clear();
                targetWordStrWordLists.clear();
                targetStrWordStrs.clear();
                targetStrWordSrcIndicesLists.clear();
                targetWordCharMaps.clear();
                similarityScores.clear();
                targetStrMatchedIndices.clear();
                targetWordStrMatchScores.clear();
                targetWordStrWordMatchedIndicesLists.clear();
                queryWordMatchScoreMaps.clear();
                queryWordMatchedTargetIndicesMaps.clear();
            },
            };

    };
    
})();