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

    def test_findings_must_be_actionable_and_consistent(self):
        finding = {"priority": "P2", "path": "frontend/src/lib/api.ts", "line": 7,
                   "body": "回傳型別缺少欄位，會導致正式 API 路徑出錯。"}
        result = {**self.clean, "decision": "REQUEST_CHANGES", "findings": [finding]}
        self.assertEqual(review.parse_result(self.events(result)), result)
        bad = [self.clean | {"decision": "REQUEST_CHANGES"},
               self.clean | {"findings": [finding]},
               result | {"findings": [finding | {"path": "../secret"}]},
               result | {"findings": [finding | {"line": 0}]},
               result | {"findings": [finding | {"priority": "P3"}]}]
        for item in bad:
            with self.subTest(item=item), self.assertRaises(ValueError):
                review.parse_result(self.events(item))

    def test_failed_checks_or_incomplete_review_cannot_approve(self):
        self.assertEqual(review.publication_decision(self.clean, True, "author", "reviewer"), "APPROVE")
        self.assertEqual(review.publication_decision(self.clean, False, "author", "reviewer"), "COMMENT")
        incomplete = self.clean | {"verification_complete": False}
        self.assertEqual(review.publication_decision(incomplete, True, "author", "reviewer"), "COMMENT")

    def test_own_pr_cannot_approve_or_request_changes(self):
        for decision in ["APPROVE", "REQUEST_CHANGES"]:
            result = self.clean | {"decision": decision}
            self.assertEqual(review.publication_decision(result, True, "owner", "owner"), "COMMENT")


if __name__ == "__main__":
    unittest.main()
