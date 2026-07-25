/**
 * Generated from the pinned GeometryOS OpenAPI contract.
 * Do not edit directly.
 */
export interface components {
  schemas: {
    /** AltitudeConstraint */
    AltitudeConstraint: {
      /** Foot */
      foot: string;
      /** From Point */
      from_point: string;
      /** Id */
      id: string;
      /** Reason */
      reason?: string | null;
      /** Segment */
      segment: string;
      /** To Object */
      to_object: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "altitude";
    };
    /** AngleBisectorConstraint */
    AngleBisectorConstraint: {
      /** Angle */
      angle: string;
      /** Id */
      id: string;
      /** Ray */
      ray: string;
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "angle_bisector";
    };
    /** AngleObject */
    AngleObject: {
      /** Id */
      id: string;
      /** Points */
      points: [string, string, string];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "angle";
    };
    /** BelongsToConstraint */
    BelongsToConstraint: {
      /** Id */
      id: string;
      /** Object */
      object: string;
      /** Point */
      point: string;
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "belongs_to";
    };
    /** CircleObject */
    CircleObject: {
      /** Center */
      center: string;
      /** Id */
      id: string;
      /** Radius Point */
      radius_point?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "circle";
    };
    /** CircumcircleConstraint */
    CircumcircleConstraint: {
      /** Circle */
      circle: string;
      /** Id */
      id: string;
      /** Reason */
      reason?: string | null;
      /** Triangle */
      triangle: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "circumcircle";
    };
    /** CollinearConstraint */
    CollinearConstraint: {
      /** Id */
      id: string;
      /** Points */
      points: string[];
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "collinear";
    };
    /** ConstructionStep */
    ConstructionStep: {
      /** Action */
      action: string;
      /** Constraints */
      constraints?: string[];
      /** Id */
      id: string;
      /** Objects */
      objects: string[];
      /** Reason */
      reason?: string | null;
    };
    /** EqualLengthConstraint */
    EqualLengthConstraint: {
      /** Id */
      id: string;
      /** Objects */
      objects: [string, string];
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "equal_length";
    };
    /** GirScene */
    GirScene: {
      /** Constraints */
      constraints: (
        | components["schemas"]["BelongsToConstraint"]
        | components["schemas"]["CollinearConstraint"]
        | components["schemas"]["NonCollinearConstraint"]
        | components["schemas"]["ParallelConstraint"]
        | components["schemas"]["PerpendicularConstraint"]
        | components["schemas"]["EqualLengthConstraint"]
        | components["schemas"]["MidpointConstraint"]
        | components["schemas"]["IntersectionConstraint"]
        | components["schemas"]["AltitudeConstraint"]
        | components["schemas"]["MedianConstraint"]
        | components["schemas"]["AngleBisectorConstraint"]
        | components["schemas"]["CircumcircleConstraint"]
        | components["schemas"]["IncircleConstraint"]
      )[];
      /** Construction Steps */
      construction_steps: components["schemas"]["ConstructionStep"][];
      /** Metadata */
      metadata?: {
        [key: string]: unknown;
      };
      /** Objects */
      objects: (
        | components["schemas"]["PointObject"]
        | components["schemas"]["SegmentObject"]
        | components["schemas"]["LineObject"]
        | components["schemas"]["RayObject"]
        | components["schemas"]["CircleObject"]
        | components["schemas"]["TriangleObject"]
        | components["schemas"]["AngleObject"]
        | components["schemas"]["LabelObject"]
      )[];
      /**
       * Scene Type
       * @constant
       */
      scene_type: "2d";
      /**
       * Schema Version
       * @constant
       */
      schema_version: "0.2.0";
    };
    /** IncircleConstraint */
    IncircleConstraint: {
      /** Circle */
      circle: string;
      /** Id */
      id: string;
      /** Reason */
      reason?: string | null;
      /** Triangle */
      triangle: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "incircle";
    };
    /** IntersectionConstraint */
    IntersectionConstraint: {
      /** Id */
      id: string;
      /** Objects */
      objects: [string, string];
      /** Point */
      point: string;
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "intersection";
    };
    /** LabelObject */
    LabelObject: {
      /** Id */
      id: string;
      /** Target */
      target: string;
      /** Text */
      text: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "label";
    };
    /** LineObject */
    LineObject: {
      /** Id */
      id: string;
      /** Points */
      points: [string, string];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "line";
    };
    /** MedianConstraint */
    MedianConstraint: {
      /** From Point */
      from_point: string;
      /** Id */
      id: string;
      /** Midpoint */
      midpoint: string;
      /** Reason */
      reason?: string | null;
      /** Segment */
      segment: string;
      /** To Object */
      to_object: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "median";
    };
    /** MidpointConstraint */
    MidpointConstraint: {
      /** Id */
      id: string;
      /** Object */
      object: string;
      /** Point */
      point: string;
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "midpoint";
    };
    /** NonCollinearConstraint */
    NonCollinearConstraint: {
      /** Id */
      id: string;
      /** Points */
      points: [string, string, string];
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "non_collinear";
    };
    /** ParallelConstraint */
    ParallelConstraint: {
      /** Id */
      id: string;
      /** Objects */
      objects: [string, string];
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "parallel";
    };
    /** PerpendicularConstraint */
    PerpendicularConstraint: {
      /** Id */
      id: string;
      /** Objects */
      objects: [string, string];
      /** Reason */
      reason?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "perpendicular";
    };
    /** PointObject */
    PointObject: {
      /** Id */
      id: string;
      /** Label */
      label?: string | null;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "point";
    };
    /** RayObject */
    RayObject: {
      /** Id */
      id: string;
      /** Start */
      start: string;
      /** Through */
      through: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "ray";
    };
    /** SegmentObject */
    SegmentObject: {
      /** Id */
      id: string;
      /** Points */
      points: [string, string];
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "segment";
    };
    /** TriangleObject */
    TriangleObject: {
      /** Id */
      id: string;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      type: "triangle";
      /** Vertices */
      vertices: [string, string, string];
    };
  };
}
