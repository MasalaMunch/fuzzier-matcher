const FuzzierMatcher = (() => {

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

    const MaxHeap = (() => {

        const fixChildren = (compareItems, array, i, item) => {
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

        return (compareItems, array) => {
            for (let i=(array.length-2)>>1; i>=0; i--) {
                fixChildren(compareItems, array, i, array[i]);
            }
            return {
                getMax: () => array[0],
                delMax: () => fixChildren(compareItems, array, 0, array.pop()),
                };
        };

    })();

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

    const SimilarityScore = (numberA, numberB, minScore, maxScore) => {
        return Math.max(minScore, maxScore - Math.abs(numberA - numberB));
    };

    const DumbWordList = (str) => [str];
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

    const DefaultWordList = (str) => {
        const match = str.toLowerCase().match(/[^\s]+/g);
        return match === null? [] : match;
    };
    const DefaultWordStr = (wordList) => wordList.join(" ");
    const DefaultWordSrcIndicesList = (srcStr, wordList) => {
        const This = new Array(wordList.length);
        if (wordList.length > 0) {
            srcStr = srcStr.toLowerCase();
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

        let queryWordList = [];
        const queryWordMultiSet = MultiSet();
        let bonusScoreWeight = 1;

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
        });

        const WordMatchScore = (queryWord, targetWord, 
                                returnMatchedTargetIndicesInstead) => {

            const queryCharList = queryWordCharLists.get(queryWord);
            const queryCharIndicesList = (
                queryWordCharIndicesLists.get(queryWord)
                );
            let remainingTargetIndices = targetWord.length;
            const targetCharMap = targetWordCharMaps.get(targetWord);
            if (returnMatchedTargetIndicesInstead) {
                var matchedTargetIndices = [];
            } else {
                var matchScore = 0;
            }
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
                        if (returnMatchedTargetIndicesInstead) {
                            matchedTargetIndices.push(
                                moreIndices === queryIndices? 
                                lessIndex : moreIndex
                                );                              
                        } else {
                            matchScore += SimilarityScore(
                                lessIndex, moreIndex, 1, queryWord.length + 1
                                );
                        }
                    }
                    if ((remainingTargetIndices -= targetIndices.length) 
                    === 0) {
                        break;
                    }
                }
            }
            if (returnMatchedTargetIndicesInstead) {
                return matchedTargetIndices;
            }
            return (
                matchScore 
                + bonusScoreWeight * SimilarityScore(
                    queryWord.length, targetWord.length, 0, queryWord.length
                    )
                );

        };
        const queryWordMatchScoreMaps = LazyMap((queryWord) => {
            return LazyMap((targetWord) => {
                return WordMatchScore(queryWord, targetWord);
            });
        });
        const queryWordMatchedTargetIndicesMaps = LazyMap((queryWord) => {
            return LazyMap((targetWord) => {
                return WordMatchScore(queryWord, targetWord, true);
            });
        });

        const targetWordMultiSet = MultiSet();
        const targetWordCharMaps = LazyMap(CharMap);

        const targetWordStrMultiSet = MultiSet();
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

        const WordStrMatchScore = (targetWordStr, 
                                   returnWordMatchedIndicesListInstead) => {

            const targetWordList = targetWordStrWordLists.get(targetWordStr);
            const bigWordList = (
                queryWordList.length > targetWordList.length? 
                queryWordList : targetWordList
                );
            const smallWordList = (
                bigWordList === queryWordList? targetWordList : queryWordList
                );
            const unpairedSmallListIndices = new Array(smallWordList.length);
            const smallBigListIndexHeapList = new Array(smallWordList.length);
            const smallScoresList = new Array(smallWordList.length);
            for (let i=0; i<smallWordList.length; i++) {
                unpairedSmallListIndices[i] = i;
                const bigListIndices = new Array(bigWordList.length);
                const scores = new Array(bigWordList.length);
                for (let j=0; j<bigWordList.length; j++) {
                    bigListIndices[j] = j;
                    scores[j] = (
                        (bigWordList === queryWordList? 
                         queryWordMatchScoreMaps.get(bigWordList[j])
                             .get(smallWordList[i])
                         : queryWordMatchScoreMaps.get(smallWordList[i])
                             .get(bigWordList[j]))
                        + bonusScoreWeight * SimilarityScore(
                            i, j, 0, queryWordList.length
                            )
                        );
                }
                smallBigListIndexHeapList[i] = MaxHeap(
                    (j, k) => scores[j] - scores[k], bigListIndices
                    );
                smallScoresList[i] = scores;
            }
            const smallBigIndexList = new Array(smallWordList.length);
            const bigSmallIndexList = new Array(bigWordList.length);
            while (unpairedSmallListIndices.length > 0) {
                const i = unpairedSmallListIndices.pop();
                const bigListIndexHeap = smallBigListIndexHeapList[i];
                while (true) {
                    const j = bigListIndexHeap.getMax();
                    const iConflict = bigSmallIndexList[j];
                    if (iConflict === undefined || smallScoresList[i][j] 
                    > smallScoresList[iConflict][j]) {
                        smallBigIndexList[i] = j;
                        bigSmallIndexList[j] = i;
                        if (iConflict !== undefined) {
                            smallBigListIndexHeapList[iConflict].delMax();
                            unpairedSmallListIndices.push(iConflict);
                        }
                        break;
                    }
                    bigListIndexHeap.delMax();
                }
            }

            if (returnWordMatchedIndicesListInstead) {
                const targetWordMatchedIndicesList = (
                    new Array(targetWordList.length)
                    );
                if (bigWordList === queryWordList) {
                    for (let i=0; i<smallBigIndexList.length; i++) {
                        targetWordMatchedIndicesList[i] = (
                            queryWordMatchedTargetIndicesMaps
                                .get(bigWordList[smallBigIndexList[i]])
                                    .get(smallWordList[i])
                            );
                    }
                    return targetWordMatchedIndicesList;
                } else {
                    for (let i=0; i<smallBigIndexList.length; i++) {
                        const j = smallBigIndexList[i];
                        targetWordMatchedIndicesList[j] = (
                            queryWordMatchedTargetIndicesMaps
                                .get(smallWordList[i]).get(bigWordList[j])
                            );
                    }  
                }
                return targetWordMatchedIndicesList;
            }
            let matchScore = 0;
            for (let i=0; i<smallBigIndexList.length; i++) {
                matchScore += smallScoresList[i][smallBigIndexList[i]];
            }
            return (
                matchScore 
                + bonusScoreWeight * SimilarityScore(
                    queryWordList.length, targetWordList.length, 
                    0, queryWordList.length
                    )
                );

        };
        const targetWordStrMatchScores = LazyMap((wordStr) => {
            return WordStrMatchScore(wordStr);
        });
        const targetWordStrWordMatchedIndicesLists = LazyMap((wordStr) => {
            return WordStrMatchScore(wordStr, true);
        });

        const targetStrMatchedIndices = LazyMap((str) => {
            const matchedIndices = [];
            const wordStr = targetStrWordStrs.get(str);
            const wordSrcIndicesList = WordSrcIndicesList(
                str, targetWordStrWordLists.get(wordStr)
                );
            const wordMatchedIndicesList = targetWordStrWordMatchedIndicesLists
                .get(wordStr);
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
                let queryCharCount = 0;
                for (let i=0; i<queryWordList.length; i++) {
                    queryCharCount += queryWordList[i].length;
                }
                bonusScoreWeight = (
                    1 / (1 + queryWordList.length + queryWordList.length**2 
                    + queryCharCount)
                    );
            },
            getScore: (targetStr) => {
                return targetWordStrMatchScores.get(
                    targetStrWordStrs.get(targetStr)
                    );
            },
            getIndices: (targetStr) => {
                return targetStrMatchedIndices.get(targetStr);
            },
            delete: (targetStr) => {
                targetStrMatchedIndices.delete(targetStr);
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
                queryWordMatchScoreMaps.clear();
                queryWordMatchedTargetIndicesMaps.clear();
                targetWordMultiSet.clear();
                targetWordCharMaps.clear();
                targetWordStrMultiSet.clear();
                targetWordStrWordLists.clear();
                targetStrWordStrs.clear();
                targetWordStrMatchScores.clear();
                targetWordStrWordMatchedIndicesLists.clear();
                targetStrMatchedIndices.clear();
            },
            };

    };
    
})();