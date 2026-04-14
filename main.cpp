#include <gtest/gtest.h>
#include <iostream>
#include <vector>
#include <algorithm>
#include "distinct.hpp"

TEST(distinct, oneElement) {
  std::vector<int> vec {2};
  EXPECT_EQ(numberOfDistinctElements(vec), 1);
}

TEST(distinct, repeatedElement) {
  std::vector<int> vec {2, 2, 2, 2, 2};
  EXPECT_EQ(numberOfDistinctElements(vec), 1);
}

TEST(distinct, doubledElements) {
  std::vector<int> vec {1, 1, 2, 2, 3, 3};
  EXPECT_EQ(numberOfDistinctElements(vec), 3);
}

TEST(distinct, allUnique) {
  std::vector<int> vec {8, 2, 9, 1, 32, 31};
  EXPECT_EQ(numberOfDistinctElements(vec), 6);
}

TEST(distinct, someUnique) {
  std::vector<int> vec {8, 2, 1, 9, 8, 1, 2, 5};
  EXPECT_EQ(numberOfDistinctElements(vec), 5);
}

int main(int argc, char* argv[]) {
  ::testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}
