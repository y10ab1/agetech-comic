import copy
import json
import unittest

import review


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.pr = {
            "state": "open", "draft": False, "author_association": "COLLABORATOR",
            "head": {"sha": "a" * 40, "repo": {"full_name": review.REPO}},
            "base": {"sha": "b" * 40, "repo": {"full_name": review.REPO}},
        }
        self.clean = {"decision": "APPROVE", "summary": "已檢查變更與測試。",
                      "verification_complete": True, "findings": []}

    def events(self, result, reason="stop"):
        return "\n".join(json.dumps(event) for event in [
            {"type": "text", "part": {"text": json.dumps(result)}},
            {"type": "step_finish", "part": {"reason": reason}},
        ])

    def test_only_open_ready_trusted_prs_including_collaborator_forks(self):
        self.assertTrue(review.eligible(self.pr))
        for field, value in [("state", "closed"), ("draft", True),
                             ("author_association", "CONTRIBUTOR")]:
            other = copy.deepcopy(self.pr)
            other[field] = value
            self.assertFalse(review.eligible(other))
        other = copy.deepcopy(self.pr)
        other["head"]["repo"] = {"full_name": "collaborator/fork"}
        self.assertTrue(review.eligible(other))
        other["head"]["repo"] = None
        self.assertFalse(review.eligible(other))

    def test_changed_head_or_base_blocks_publication(self):
        self.assertTrue(review.same_revision(self.pr, self.pr))
        for side in ["head", "base"]:
            other = copy.deepcopy(self.pr)
            other[side]["sha"] = "c" * 40
            self.assertFalse(review.same_revision(self.pr, other))
        other = copy.deepcopy(self.pr)
        other["state"] = "closed"
        self.assertFalse(review.same_revision(self.pr, other))

    def test_only_own_completed_matching_review_is_deduplicated(self):
        item = {"user": {"login": "reviewer"}, "state": "APPROVED", "body": review.marker(self.pr)}
        self.assertTrue(review.already_reviewed([item], self.pr, "reviewer"))
        self.assertFalse(review.already_reviewed([item], self.pr, "other"))
        item["state"] = "DISMISSED"
        self.assertFalse(review.already_reviewed([item], self.pr, "reviewer"))

    def test_valid_completed_model_result(self):
        self.assertEqual(review.parse_result(self.events(self.clean)), self.clean)

    def test_error_truncated_or_malformed_output_fails_closed(self):
        bad_outputs = ["", "not json", self.events(self.clean, "length"),
                       self.events(self.clean) + '\n{"type":"error"}',
                       self.events({**self.clean, "verification_complete": "true"}),
                       self.events({**self.clean, "decision": "LGTM"})]
        for output in bad_outputs:
            with self.subTest(output=output), self.assertRaises(ValueError):
                review.parse_result(output)

    def finding(self, priority="P2"):
        return {"priority": priority, "path": "frontend/src/lib/api.ts", "line": 7,
                "body": "回傳型別缺少欄位，會導致正式 API 路徑出錯。"}

    def test_malformed_findings_are_rejected(self):
        result = {**self.clean, "decision": "REQUEST_CHANGES", "findings": [self.finding()]}
        self.assertEqual(review.parse_result(self.events(result)), result)
        bad = [result | {"findings": [self.finding() | {"path": "../secret"}]},
               result | {"findings": [self.finding() | {"path": " "}]},
               result | {"findings": [self.finding() | {"line": 0}]},
               result | {"findings": [self.finding() | {"priority": "P0"}]},
               result | {"findings": [self.finding() | {"body": ""}]}]
        for item in bad:
            with self.subTest(item=item), self.assertRaises(ValueError):
                review.parse_result(self.events(item))

    def test_blocking_findings_request_changes_even_if_verification_incomplete(self):
        # Regression: PR #11 had two P2 findings but was published as COMMENT.
        for decision in ["COMMENT", "APPROVE", "REQUEST_CHANGES"]:
            for checks_ok in [True, False]:
                result = self.clean | {"decision": decision, "verification_complete": False,
                                       "findings": [self.finding("P2"), self.finding("P3")]}
                self.assertEqual(review.publication_decision(result, checks_ok, "author", "reviewer"),
                                 "REQUEST_CHANGES")
        p1 = self.clean | {"findings": [self.finding("P1")]}
        self.assertEqual(review.publication_decision(p1, True, "author", "reviewer"), "REQUEST_CHANGES")

    def test_suggestions_only_do_not_block_approval(self):
        result = self.clean | {"findings": [self.finding("P3")]}
        self.assertEqual(review.publication_decision(result, True, "author", "reviewer"), "APPROVE")
        unsure = self.clean | {"decision": "REQUEST_CHANGES", "findings": [self.finding("P3")]}
        self.assertEqual(review.publication_decision(unsure, True, "author", "reviewer"), "COMMENT")

    def test_failed_checks_or_incomplete_review_cannot_approve(self):
        self.assertEqual(review.publication_decision(self.clean, True, "author", "reviewer"), "APPROVE")
        self.assertEqual(review.publication_decision(self.clean, False, "author", "reviewer"), "COMMENT")
        incomplete = self.clean | {"verification_complete": False}
        self.assertEqual(review.publication_decision(incomplete, True, "author", "reviewer"), "COMMENT")
        comment = self.clean | {"decision": "COMMENT"}
        self.assertEqual(review.publication_decision(comment, True, "author", "reviewer"), "COMMENT")

    def test_incomplete_reviews_stay_retryable_regardless_of_event(self):
        blocking = self.clean | {"decision": "COMMENT", "findings": [self.finding("P2")]}
        for complete, checks_ok, expected in [(False, True, False), (True, False, False),
                                               (False, False, False), (True, True, True)]:
            result = blocking | {"verification_complete": complete}
            self.assertEqual(review.publication_decision(result, checks_ok, "author", "reviewer"),
                             "REQUEST_CHANGES")
            self.assertIs(review.review_complete(result, checks_ok), expected)

    def test_own_pr_cannot_approve_or_request_changes(self):
        for findings in [[], [self.finding("P1")]]:
            result = self.clean | {"findings": findings}
            self.assertEqual(review.publication_decision(result, True, "owner", "owner"), "COMMENT")


if __name__ == "__main__":
    unittest.main()
