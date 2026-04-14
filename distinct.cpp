#include "distinct.hpp"

#include <algorithm>
#include <vector>

int numberOfDistinctElements(const std::vector<int>& vec) {
  std::vector<int> sortedVec = vec;
  std::sort(sortedVec.begin(), sortedVec.end());
  auto uniqueEnd = std::unique(sortedVec.begin(), sortedVec.end());
  return static_cast<int>(uniqueEnd - sortedVec.begin());
}
